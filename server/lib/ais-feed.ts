// ── AIS vessel feed ──────────────────────────────────────────────────────────
// One leader-gated persistent connection to an AIS provider, maintaining an
// in-memory Map<mmsi, Vessel> of the latest position per ship — correlated with
// the ship's STATIC data (name + type), which AIS broadcasts in SEPARATE
// messages from position (you cannot classify a tanker from a position report
// alone; you must join ShipStaticData → PositionReport by MMSI). The REST routes
// serve a snapshot of this map: the stream IS the cache, exactly like
// /api/trading/quotes' latestPrices and lib/yahoo-overnight-stream.ts. Never add
// a request-time fetch on top.
//
// Provider seam: the vessel store, classification, staleness eviction and
// chokepoint counting below are provider-agnostic. An AisProvider only has to
// push position + static updates through the handlers. aisStreamProvider (the
// free aisstream.io WebSocket) is the default; a paid satellite provider
// (Datalastic / VesselFinder LiveData, REST-poll for mid-ocean coverage) can
// implement the same interface and be selected via AIS_PROVIDER — swapping
// providers touches only selectProvider() + one new provider object, nothing
// downstream. The feed only runs on the leader AND only when the selected
// provider is configured (key present), so deploying without a key is a no-op.

import { isLeader } from "./leader";
import { SUBSCRIPTION_BOXES, CHOKEPOINTS } from "../data/maritime-geo";
import {
  categoryForType,
  isGasCarrierName,
  VESSEL_CATEGORIES,
  type VesselCategory,
} from "../data/ais-ship-types";

const STALE_MS = 15 * 60 * 1000; // drop a vessel not heard from in 15m
const MAX_VESSELS = 50_000; // hard memory cap; oldest evicted past this
const DEFAULT_SNAPSHOT_LIMIT = 8000; // cap points returned to a client
// Force a reconnect after this long with zero frames. Env-tunable so the cadence
// can be adjusted for aisstream's flakiness without a code deploy.
const WATCHDOG_SILENCE_MS = Number(process.env.AIS_WATCHDOG_MS) || 10 * 60 * 1000;

export interface Vessel {
  mmsi: number;
  name: string | null;
  lat: number;
  lon: number;
  sog: number | null; // speed over ground, knots
  cog: number | null; // course over ground, degrees
  heading: number | null; // true heading, degrees
  type: number | null; // raw AIS ship-type code
  category: VesselCategory;
  gas: boolean; // soft LNG/LPG name heuristic (tankers only)
  dest: string | null;
  draught: number | null; // max static draught, metres
  ts: number; // last message time (ms epoch)
}

// ── Provider seam ────────────────────────────────────────────────────────────

export interface AisHandlers {
  onPosition(p: {
    mmsi: number;
    lat: number;
    lon: number;
    sog: number | null;
    cog: number | null;
    heading: number | null;
  }): void;
  onStatic(s: {
    mmsi: number;
    name: string | null;
    type: number | null;
    dest: string | null;
    draught: number | null;
  }): void;
}

export interface AisProvider {
  id: string;
  start(handlers: AisHandlers): void;
  stop(): void;
}

// ── Vessel store ─────────────────────────────────────────────────────────────

const vessels = new Map<number, Vessel>();
let activeProviderId: string | null = null;
// Time (ms epoch) of the last frame received from the provider. 0 = not yet
// connected / just (re)started. Drives the silent-stale watchdog below.
let lastMessageAt = 0;

function touch(mmsi: number): Vessel {
  let v = vessels.get(mmsi);
  if (!v) {
    v = {
      mmsi,
      name: null,
      lat: NaN,
      lon: NaN,
      sog: null,
      cog: null,
      heading: null,
      type: null,
      category: "other",
      gas: false,
      dest: null,
      draught: null,
      ts: 0,
    };
    vessels.set(mmsi, v);
  }
  return v;
}

const handlers: AisHandlers = {
  onPosition(p) {
    lastMessageAt = Date.now(); // any frame (even a rejected one) = the feed is alive
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return; // AIS "n/a" sentinels (91/181)
    const v = touch(p.mmsi);
    v.lat = p.lat;
    v.lon = p.lon;
    v.sog = p.sog;
    v.cog = p.cog;
    v.heading = p.heading;
    v.ts = Date.now();
  },
  onStatic(s) {
    lastMessageAt = Date.now();
    const v = touch(s.mmsi);
    if (s.name != null) v.name = s.name;
    if (s.type != null) {
      v.type = s.type;
      v.category = categoryForType(s.type);
    }
    if (s.dest != null) v.dest = s.dest;
    if (s.draught != null) v.draught = s.draught;
    v.gas = v.category === "tanker" && isGasCarrierName(v.name);
    v.ts = Date.now();
  },
};

/** Remove stale vessels, then enforce the hard cap by dropping the oldest. */
function evictStale(): void {
  const cutoff = Date.now() - STALE_MS;
  for (const [mmsi, v] of vessels) if (v.ts < cutoff) vessels.delete(mmsi);
  if (vessels.size > MAX_VESSELS) {
    const oldest = [...vessels.values()].sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < oldest.length - MAX_VESSELS; i++) vessels.delete(oldest[i].mmsi);
  }
}

// ── Snapshot API (consumed by the REST routes) ───────────────────────────────

export interface VesselSnapshot {
  vessels: Vessel[];
  total: number; // total mappable vessels tracked (before the limit)
  source: "live" | "cold"; // "cold" = feed not running / no data yet
  lastUpdated: string | null;
}

function inBox(lon: number, lat: number, bbox: readonly number[]): boolean {
  return lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3];
}

// Kept-when-capping priority: energy vessels first (this is a tanker pillar).
const CAP_PRIORITY: Record<VesselCategory, number> = {
  tanker: 0,
  cargo: 1,
  passenger: 2,
  highspeed: 3,
  tug_special: 3,
  fishing: 4,
  pleasure: 4,
  other: 5,
};

export function getVesselSnapshot(opts?: {
  bbox?: BBoxLike;
  categories?: Set<VesselCategory>;
  limit?: number;
}): VesselSnapshot {
  const now = Date.now();
  const out: Vessel[] = [];
  let latest = 0;
  for (const v of vessels.values()) {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;
    if (now - v.ts > STALE_MS) continue;
    if (opts?.bbox && !inBox(v.lon, v.lat, opts.bbox)) continue;
    if (opts?.categories && !opts.categories.has(v.category)) continue;
    out.push(v);
    if (v.ts > latest) latest = v.ts;
  }
  const total = out.length;
  const limit = opts?.limit ?? DEFAULT_SNAPSHOT_LIMIT;
  let capped = out;
  if (out.length > limit) {
    capped = out
      .sort((a, b) => CAP_PRIORITY[a.category] - CAP_PRIORITY[b.category] || b.ts - a.ts)
      .slice(0, limit);
  }
  return {
    vessels: capped,
    total,
    source: activeProviderId && total > 0 ? "live" : "cold",
    lastUpdated: latest ? new Date(latest).toISOString() : null,
  };
}

type BBoxLike = readonly [number, number, number, number];

export interface ChokepointCount {
  id: string;
  name: string;
  lat: number;
  lon: number;
  total: number;
  byCategory: Record<VesselCategory, number>;
  tankers: number;
  gasCarriers: number;
}

export interface ChokepointSnapshot {
  chokepoints: ChokepointCount[];
  source: "live" | "cold";
  lastUpdated: string | null;
}

export function getChokepointCounts(): ChokepointSnapshot {
  const now = Date.now();
  const counts: ChokepointCount[] = CHOKEPOINTS.map((cp) => ({
    id: cp.id,
    name: cp.name,
    lon: cp.center[0],
    lat: cp.center[1],
    total: 0,
    byCategory: Object.fromEntries(VESSEL_CATEGORIES.map((c) => [c, 0])) as Record<VesselCategory, number>,
    tankers: 0,
    gasCarriers: 0,
  }));
  let latest = 0;
  let any = false;
  for (const v of vessels.values()) {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;
    if (now - v.ts > STALE_MS) continue;
    any = true;
    if (v.ts > latest) latest = v.ts;
    for (const c of counts) {
      const cp = CHOKEPOINTS.find((x) => x.id === c.id)!;
      if (!inBox(v.lon, v.lat, cp.bbox)) continue;
      c.total++;
      c.byCategory[v.category]++;
      if (v.category === "tanker") c.tankers++;
      if (v.gas) c.gasCarriers++;
    }
  }
  return {
    chokepoints: counts.sort((a, b) => b.tankers - a.tankers || b.total - a.total),
    source: activeProviderId && any ? "live" : "cold",
    lastUpdated: latest ? new Date(latest).toISOString() : null,
  };
}

// ── Feed controller ──────────────────────────────────────────────────────────

let started = false;
let provider: AisProvider | null = null;

/** Pick the configured provider, or null if none is usable (no key). Add paid
 *  providers here — the rest of this module doesn't change. */
function selectProvider(): AisProvider | null {
  const which = (process.env.AIS_PROVIDER || "aisstream").toLowerCase();
  if (which === "aisstream") return process.env.AISSTREAM_API_KEY ? aisStreamProvider : null;
  // Future paid providers, same shape:
  //   if (which === "datalastic") return process.env.DATALASTIC_API_KEY ? datalasticProvider : null;
  return null;
}

function evaluate(): void {
  const next = isLeader() ? selectProvider() : null;
  if (next && !provider) {
    provider = next;
    activeProviderId = next.id;
    lastMessageAt = Date.now(); // grace period before the watchdog can fire
    console.log(`[AIS] starting feed via "${next.id}"`);
    next.start(handlers);
  } else if (!next && provider) {
    console.log(`[AIS] stopping feed (leadership lost or provider unconfigured)`);
    provider.stop();
    provider = null;
    activeProviderId = null;
    lastMessageAt = 0;
    vessels.clear();
  }
}

// aisstream's characteristic failure is a SILENT-STALE socket — it stops sending
// frames without closing the connection, so the reconnect-on-close logic never
// fires (documented, key-independent, server-side; see aisstream/aisstream#15).
// This forces a fresh connection after a stretch of total silence, so we recover
// the moment their delivery resumes on a new socket instead of sitting on a
// dead-but-open one. Harmless during a true outage — a cheap reopen that also
// gets nothing until aisstream itself comes back.
function watchdog(): void {
  if (!provider || lastMessageAt === 0) return;
  const silentMs = Date.now() - lastMessageAt;
  if (silentMs < WATCHDOG_SILENCE_MS) return;
  console.warn(
    `[AIS] no frames for ${Math.round(silentMs / 60_000)}m — forcing reconnect (silent-stale recovery)`,
  );
  lastMessageAt = Date.now(); // reset grace so we don't thrash before the new socket can deliver
  provider.stop();
  provider.start(handlers);
}

/** Idempotent. Starts the leader-gated feed and its housekeeping timers. Safe to
 *  call from route registration at boot; leader/key gating is internal. */
export function startAisFeed(): void {
  if (started) return;
  started = true;
  setInterval(evaluate, 60_000); // re-evaluate leadership/config
  setInterval(evictStale, 5 * 60_000);
  setInterval(watchdog, 60_000); // detect + recover from silent-stale sockets
  evaluate();
}

// ── aisstream.io provider (free WebSocket, terrestrial-only) ─────────────────
// Mirrors lib/yahoo-overnight-stream.ts: one WS, reconnect with backoff, all
// message parsing here. aisstream sends TEXT JSON frames (not the protobuf
// Yahoo uses). The subscription MUST be sent within 3s of open or aisstream
// closes the socket — we send it on "open", well inside the window.

const AIS_WS_URL = "wss://stream.aisstream.io/v0/stream";

interface WsLike {
  on(ev: string, cb: (arg: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

/** number in [min,max] else null (AIS uses out-of-range values for "not available"). */
function ranged(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

/** AIS pads text with '@' (the null char). Cut at the first '@' and trim. */
function cleanName(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const n = s.split("@")[0].trim();
  return n.length ? n : null;
}

function handleRaw(raw: { toString(): string }, h: AisHandlers): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    return;
  }
  const type = msg.MessageType as string | undefined;
  // aisstream's docs spell it "MetaData" but the wire uses "Metadata" — read both.
  const meta = (msg.MetaData ?? msg.Metadata ?? {}) as Record<string, unknown>;
  const body = (msg.Message ?? {}) as Record<string, unknown>;
  const metaMmsi = typeof meta.MMSI === "number" ? meta.MMSI : null;

  const emitPos = (r: Record<string, unknown>): void => {
    const mmsi = metaMmsi ?? (typeof r.UserID === "number" ? r.UserID : null);
    if (mmsi == null) return;
    const lat = r.Latitude;
    const lon = r.Longitude;
    if (typeof lat !== "number" || typeof lon !== "number") return;
    h.onPosition({
      mmsi,
      lat,
      lon,
      sog: ranged(r.Sog, 0, 102), // 102.3 = not available
      cog: ranged(r.Cog, 0, 359.9), // 360 = not available
      heading: r.TrueHeading === 511 ? null : ranged(r.TrueHeading, 0, 359),
    });
  };
  const emitStatic = (r: Record<string, unknown>): void => {
    const mmsi = metaMmsi ?? (typeof r.UserID === "number" ? r.UserID : null);
    if (mmsi == null) return;
    h.onStatic({
      mmsi,
      name: cleanName(r.Name),
      type: typeof r.Type === "number" ? r.Type : null,
      dest: cleanName(r.Destination),
      draught: typeof r.MaximumStaticDraught === "number" ? r.MaximumStaticDraught : null,
    });
  };

  switch (type) {
    case "PositionReport":
      if (body.PositionReport) emitPos(body.PositionReport as Record<string, unknown>);
      break;
    case "StandardClassBPositionReport":
      if (body.StandardClassBPositionReport)
        emitPos(body.StandardClassBPositionReport as Record<string, unknown>);
      break;
    case "ExtendedClassBPositionReport": {
      // Class B extended carries BOTH position and type/name — feed both.
      const r = body.ExtendedClassBPositionReport as Record<string, unknown> | undefined;
      if (r) {
        emitPos(r);
        emitStatic(r);
      }
      break;
    }
    case "ShipStaticData":
      if (body.ShipStaticData) emitStatic(body.ShipStaticData as Record<string, unknown>);
      break;
  }
}

const aisStreamProvider: AisProvider = (() => {
  let sock: WsLike | null = null;
  let active: AisHandlers | null = null;
  let stopped = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  function connect(): void {
    if (stopped) return;
    const key = process.env.AISSTREAM_API_KEY;
    if (!key) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WsCtor = require("ws") as new (url: string) => WsLike;
      const s = new WsCtor(AIS_WS_URL);
      sock = s;
      s.on("open", () => {
        attempt = 0;
        const sub = {
          APIKey: key,
          // maritime-geo boxes are [w,s,e,n]; aisstream wants [[lat,lon],[lat,lon]].
          BoundingBoxes: SUBSCRIPTION_BOXES.map((b) => [
            [b[1], b[0]],
            [b[3], b[2]],
          ]),
          FilterMessageTypes: [
            "PositionReport",
            "StandardClassBPositionReport",
            "ExtendedClassBPositionReport",
            "ShipStaticData",
          ],
        };
        try {
          s.send(JSON.stringify(sub));
          console.log(`[AIS] aisstream connected — subscribed ${SUBSCRIPTION_BOXES.length} regions`);
        } catch {
          /* socket may have closed between open and send */
        }
      });
      s.on("message", (raw: unknown) => {
        if (active) handleRaw(raw as { toString(): string }, active);
      });
      s.on("error", (e: unknown) => console.warn("[AIS] ws error:", (e as Error)?.message));
      s.on("close", () => {
        if (sock === s) sock = null;
        if (!stopped) scheduleReconnect();
      });
    } catch (e) {
      console.warn("[AIS] could not open ws:", (e as Error)?.message);
      if (!stopped) scheduleReconnect();
    }
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    const delay = [3000, 10000, 30000][Math.min(attempt, 2)];
    attempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  return {
    id: "aisstream",
    start(h: AisHandlers): void {
      active = h;
      stopped = false;
      attempt = 0;
      connect();
    },
    stop(): void {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        sock?.close();
      } catch {
        /* ignore */
      }
      sock = null;
      active = null;
    },
  };
})();

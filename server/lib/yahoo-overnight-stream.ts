// ── Yahoo overnight (Blue Ocean ATS) price stream ────────────────────────────
// Yahoo's REST endpoints (quoteSummary / v7 quote / v8 chart) freeze at the 8pm
// post-market close and do NOT expose the overnight session (8pm–4am ET, marked
// "BOATS Real Time Price" on Yahoo's site). That live overnight print is only on
// Yahoo's realtime WebSocket streamer. This module holds one leader-gated WS
// connection, open ONLY during the overnight window, and exposes the latest
// overnight tick per symbol for the treemap to overlay. Everything else (regular
// / pre / post) stays on the existing REST pipeline — this is overnight-only.
//
// Message format: WS sends JSON `{ message: "<base64>" }`; the base64 decodes to
// a protobuf `PricingData`. We only need 4 fields, so we hand-roll a tiny
// wire-format reader (no protobufjs dependency):
//   field 1 (id, string)   · field 2 (price, float32)
//   field 7 (marketHours, varint) · field 8 (changePercent, float32)
// marketHours === 4 is the overnight session (distinct from PRE=0/REGULAR=1/
// POST=2). `changePercent` is already in percent units and measured vs the
// regular close — exactly the bracket value the treemap wants.

import { isLeader } from "./leader";

const WS_URL = "wss://streamer.finance.yahoo.com/?version=2";
const OVERNIGHT_MARKET_HOURS = 4;
const STALE_MS = 30 * 60 * 1000; // drop ticks older than 30m (belt-and-suspenders)
const SUBSCRIBE_CHUNK = 200;

type Tick = { price: number; changePercent: number; ts: number };

const overnightMap = new Map<string, Tick>();
let ws: WsLike | null = null;
let started = false;
let symbolProvider: (() => Promise<string[]>) | null = null;

interface WsLike {
  on(ev: string, cb: (arg: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

/** Latest overnight tick for a symbol, or null when absent/stale/off-hours. */
export function getOvernightQuote(
  symbol: string,
): { price: number; changePercent: number } | null {
  const t = overnightMap.get(symbol);
  if (!t || Date.now() - t.ts > STALE_MS) return null;
  return { price: t.price, changePercent: t.changePercent };
}

/** Idempotent. `provider` yields the symbols to subscribe (called per connect,
 *  so the universe refreshes on reconnect). Leader + clock gating are internal. */
export function startYahooOvernightStream(provider: () => Promise<string[]>): void {
  if (started) return;
  started = true;
  symbolProvider = provider;
  setInterval(evaluate, 60_000);
  evaluate();
}

function evaluate(): void {
  const shouldConnect = isLeader() && isOvernightWindow();
  if (shouldConnect && !ws) connect();
  else if (!shouldConnect && ws) disconnect();
}

async function connect(): Promise<void> {
  let symbols: string[] = [];
  try {
    symbols = (await symbolProvider?.()) ?? [];
  } catch {
    /* provider failed — retry on next evaluate tick */
  }
  if (!symbols.length) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WsCtor = require("ws") as new (url: string, opts: unknown) => WsLike;
    const sock = new WsCtor(WS_URL, {
      headers: { Origin: "https://finance.yahoo.com" },
    });
    ws = sock;

    sock.on("open", () => {
      console.log(`[Overnight WS] connected — subscribing ${symbols.length} symbols`);
      for (let i = 0; i < symbols.length; i += SUBSCRIBE_CHUNK) {
        const chunk = symbols.slice(i, i + SUBSCRIBE_CHUNK);
        setTimeout(() => {
          try {
            sock.send(JSON.stringify({ subscribe: chunk }));
          } catch {
            /* socket may have closed mid-stagger */
          }
        }, (i / SUBSCRIBE_CHUNK) * 250);
      }
    });

    sock.on("message", (raw: unknown) => onMessage(raw as { toString(): string }));
    sock.on("error", (e: unknown) =>
      console.warn("[Overnight WS] error:", (e as Error)?.message),
    );
    sock.on("close", () => {
      if (ws === sock) {
        ws = null;
        overnightMap.clear();
      }
    });
  } catch (e) {
    ws = null;
    console.warn("[Overnight WS] could not start:", (e as Error)?.message);
  }
}

function disconnect(): void {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
  overnightMap.clear();
  console.log("[Overnight WS] disconnected — outside overnight window");
}

function onMessage(raw: { toString(): string }): void {
  let b64: string;
  try {
    const j = JSON.parse(raw.toString()) as { message?: string };
    if (!j.message) return;
    b64 = j.message;
  } catch {
    return;
  }
  let dec: DecodedTicker;
  try {
    dec = decodeYaticker(Buffer.from(b64, "base64"));
  } catch {
    return;
  }
  if (
    !dec.id ||
    dec.marketHours !== OVERNIGHT_MARKET_HOURS ||
    typeof dec.price !== "number" ||
    typeof dec.changePercent !== "number"
  ) {
    return;
  }
  overnightMap.set(dec.id, {
    price: dec.price,
    changePercent: dec.changePercent,
    ts: Date.now(),
  });
}

// ── Overnight window (ET) ────────────────────────────────────────────────────
// Blue Ocean overnight sessions run each weeknight 8:00pm–4:00am ET, Sunday
// night through Thursday night. Outside this the streamer sends no marketHours=4
// ticks, so connecting would just idle — we skip it.
function isOvernightWindow(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  let hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  if (hour === 24) hour = 0;

  const evening = hour >= 20; // 8pm–midnight
  const early = hour < 4; // midnight–4am
  if (!evening && !early) return false;

  // No session: Fri night, all Sat, and Sat-night (= Sun early-am).
  if (evening && wd === "Fri") return false;
  if (wd === "Sat") return false;
  if (early && wd === "Sun") return false;
  return true;
}

// ── Minimal protobuf reader (only the 4 fields we need) ──────────────────────
type DecodedTicker = {
  id?: string;
  price?: number;
  marketHours?: number;
  changePercent?: number;
};

function decodeYaticker(buf: Buffer): DecodedTicker {
  const out: DecodedTicker = {};
  let pos = 0;
  const len = buf.length;
  while (pos < len) {
    const [tag, p1] = readVarint(buf, pos);
    pos = p1;
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (wire === 0) {
      const [v, p2] = readVarint(buf, pos);
      pos = p2;
      if (field === 7) out.marketHours = v;
    } else if (wire === 5) {
      const v = buf.readFloatLE(pos);
      pos += 4;
      if (field === 2) out.price = v;
      else if (field === 8) out.changePercent = v;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 2) {
      const [l, p2] = readVarint(buf, pos);
      pos = p2;
      if (field === 1) out.id = buf.toString("utf8", pos, pos + l);
      pos += l;
    } else {
      break; // unknown wire type — stop rather than misalign
    }
  }
  return out;
}

// Consumes a full varint (all continuation bytes) but only accumulates the low
// 28 bits — enough for tags, marketHours, and lengths; larger skipped fields
// (sint64 time/volume) advance `pos` correctly even though their value is unused.
function readVarint(buf: Buffer, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  let b = 0;
  do {
    if (pos >= buf.length) break;
    b = buf[pos++];
    if (shift < 28) result |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return [result >>> 0, pos];
}

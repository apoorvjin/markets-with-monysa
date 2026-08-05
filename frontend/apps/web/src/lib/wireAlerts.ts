/**
 * Wire in-app breaking-news alert engine (Path A).
 *
 * Client-side, no auth: turns the stream of classified Wire items into at most
 * one interrupting banner per batch, with dedupe, cooldown, and escalation.
 * Adapted from the WorldMonitor Alerts spec (§2) to Finbrio's Wire data model
 * — we have {severity, pubDate, source, link, desk} but not the spec's threat
 * tiers / story-phase / importanceScore / OREF fields, so those gates are
 * omitted rather than faked.
 *
 * Severity map: Wire `breaking` → critical, `alert` → high. `caution`/`normal`
 * never fire (spec gate: level must be critical or high).
 *
 * The core is pure and dependency-injected (clock / storage / sound) so it can
 * be unit-driven in Node; the module also exports a browser singleton.
 */

import type { WireItem } from "@monysa/contracts";

export type AlertSeverity = "critical" | "high";
export type Sensitivity = "critical-and-high" | "critical-only";

export interface AlertSettings {
  enabled: boolean;
  soundEnabled: boolean;
  sensitivity: Sensitivity;
}

export const DEFAULT_SETTINGS: AlertSettings = {
  enabled: true,
  soundEnabled: true,
  sensitivity: "critical-and-high",
};

export interface ActiveAlert {
  id: string;
  key: string;
  severity: AlertSeverity;
  title: string;
  source: string;
  link: string;
  desk: string;
  pubDate: string;
  firedAt: number;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface EngineDeps {
  now(): number;
  storage: KeyValueStore | null;
  playSound(): void;
}

// ── Timing constants (spec §2) ─────────────────────────────────────────────
const GRACE_MS = 10_000; // FR-A4 gate 2 — startup silence
const RECENCY_MS = 15 * 60_000; // FR-A4 gate 6
const DEDUPE_MS = 30 * 60_000; // FR-A4 gate 10
const DISMISS_SUPPRESS_MS = 30 * 60_000; // FR-A14
const COOLDOWN_MS = 60_000; // FR-A9
const SOUND_COOLDOWN_MS = 5 * 60_000; // FR-A13
const MAX_VISIBLE = 3; // FR-A11
export const AUTO_DISMISS_MS: Record<AlertSeverity, number> = {
  critical: 60_000, // FR-A12
  high: 30_000,
};

const SETTINGS_KEY = "finbrio.wire.alerts.settings";
const DEDUPE_KEY = "finbrio.wire.alerts.dedupe";
const SUPPRESS_KEY = "finbrio.wire.alerts.suppressed";

export function mapSeverity(wireSeverity: string): AlertSeverity | null {
  if (wireSeverity === "breaking") return "critical";
  if (wireSeverity === "alert") return "high";
  return null;
}

function hostname(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** FR-A6 — stable key from normalized headline + source + link host. */
export function alertKey(item: Pick<WireItem, "title" | "source" | "link">): string {
  const norm = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const basis = `${norm}|${item.source.toLowerCase()}|${hostname(item.link)}`;
  // djb2
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export class WireAlertEngine {
  private readonly deps: EngineDeps;
  private readonly initAt: number;

  private settings: AlertSettings;
  private visible: ActiveAlert[] = [];
  private dedupe: Record<string, number> = {};
  private suppressed: Record<string, number> = {};

  private lastAlertAt = 0;
  private lastAlertSeverity: AlertSeverity | null = null;
  private lastSoundAt = 0;

  private readonly listeners = new Set<() => void>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.initAt = deps.now();
    this.settings = this.loadSettings();
    this.dedupe = this.loadPruned(DEDUPE_KEY, DEDUPE_MS);
    this.suppressed = this.loadPruned(SUPPRESS_KEY, DISMISS_SUPPRESS_MS);
  }

  // ── Subscription ─────────────────────────────────────────────────────────
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getVisible = (): ActiveAlert[] => this.visible;
  getSettings = (): AlertSettings => this.settings;

  private emit() {
    for (const cb of this.listeners) cb();
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  setSettings(patch: Partial<AlertSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.persist(SETTINGS_KEY, this.settings);
    // Turning the feature off clears the screen immediately.
    if (!this.settings.enabled && this.visible.length) this.visible = [];
    this.emit();
  }

  /** FR-C1 — another tab changed settings; re-read and re-render. */
  syncFromStorage() {
    const next = this.loadSettings();
    this.settings = next;
    if (!next.enabled && this.visible.length) this.visible = [];
    this.emit();
  }

  // ── Ingestion (spec §2.2–2.3) ────────────────────────────────────────────
  ingest(items: WireItem[]): ActiveAlert | null {
    const now = this.deps.now();
    if (!this.settings.enabled) return null; // gate 1
    if (now - this.initAt <= GRACE_MS) return null; // gate 2 (do not consume dedupe)

    const eligible: { item: WireItem; sev: AlertSeverity; key: string; t: number }[] = [];
    for (const item of items) {
      const sev = mapSeverity(item.severity); // gates 3–4
      if (!sev) continue;
      if (sev === "high" && this.settings.sensitivity === "critical-only") continue; // gate 5
      const t = Date.parse(item.pubDate); // gate 6 (NaN/missing → skip)
      if (Number.isNaN(t) || now - t > RECENCY_MS) continue;
      const key = alertKey(item);
      const supUntil = this.suppressed[key];
      if (supUntil && now < supUntil) continue; // manual-dismiss suppression
      const firedAt = this.dedupe[key];
      if (firedAt && now - firedAt < DEDUPE_MS) continue; // gate 10
      eligible.push({ item, sev, key, t });
    }
    if (eligible.length === 0) return null;

    // FR-A8 — one per batch: critical outranks high, then newest.
    eligible.sort((a, b) => {
      if (a.sev !== b.sev) return a.sev === "critical" ? -1 : 1;
      return b.t - a.t;
    });
    const winner = eligible[0];
    if (!winner) return null;

    // FR-A9 — 60s cooldown, broken only by escalation to critical.
    if (this.lastAlertAt && now - this.lastAlertAt < COOLDOWN_MS) {
      const escalation = winner.sev === "critical" && this.lastAlertSeverity !== "critical";
      if (!escalation) return null;
    }

    const alert: ActiveAlert = {
      id: `${winner.key}-${now}`,
      key: winner.key,
      severity: winner.sev,
      title: winner.item.title,
      source: winner.item.source,
      link: winner.item.link,
      desk: winner.item.desk,
      pubDate: winner.item.pubDate,
      firedAt: now,
    };

    this.dedupe[winner.key] = now;
    this.persist(DEDUPE_KEY, this.dedupe);
    this.lastAlertAt = now;
    this.lastAlertSeverity = winner.sev;
    this.pushVisible(alert);

    // FR-A13 — chime, gated by setting + 5-min cooldown.
    if (this.settings.soundEnabled && now - this.lastSoundAt > SOUND_COOLDOWN_MS) {
      this.lastSoundAt = now;
      try {
        this.deps.playSound();
      } catch {
        /* sound is best-effort */
      }
    }

    this.emit();
    return alert;
  }

  // FR-A11 — cap 3; critical evicts all high; else evict oldest.
  private pushVisible(alert: ActiveAlert) {
    let next = this.visible;
    if (alert.severity === "critical") next = next.filter((a) => a.severity !== "high");
    next = [...next, alert];
    while (next.length > MAX_VISIBLE) next = next.slice(1);
    this.visible = next;
  }

  /** Remove an alert. Manual dismissal suppresses its key for 30 min (FR-A14). */
  dismiss(id: string, opts: { manual: boolean }) {
    const target = this.visible.find((a) => a.id === id);
    if (!target) return;
    this.visible = this.visible.filter((a) => a.id !== id);
    if (opts.manual) {
      this.suppressed[target.key] = this.deps.now() + DISMISS_SUPPRESS_MS;
      this.persist(SUPPRESS_KEY, this.suppressed);
    }
    this.emit();
  }

  // ── Persistence helpers ──────────────────────────────────────────────────
  private loadSettings(): AlertSettings {
    const raw = this.deps.storage?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AlertSettings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  // FR-A7 — persist dedupe/suppress maps and prune stale entries on load.
  private loadPruned(key: string, ttl: number): Record<string, number> {
    const raw = this.deps.storage?.getItem(key);
    if (!raw) return {};
    let parsed: Record<string, number> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, number>;
    } catch {
      return {};
    }
    const now = this.deps.now();
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      // suppressed stores an "until" ts; dedupe stores a "firedAt" ts.
      const keep = key === SUPPRESS_KEY ? v > now : now - v < ttl;
      if (keep) out[k] = v;
    }
    this.persist(key, out);
    return out;
  }

  private persist(key: string, value: unknown) {
    try {
      this.deps.storage?.setItem(key, JSON.stringify(value));
    } catch {
      /* storage may be unavailable / full */
    }
  }
}

// ── Browser singleton ──────────────────────────────────────────────────────
function browserDeps(): EngineDeps {
  const storage: KeyValueStore | null =
    typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  return {
    now: () => Date.now(),
    storage,
    playSound: playChime,
  };
}

let audioCtx: AudioContext | null = null;
/** Short two-tone chime via WebAudio — no asset file needed. */
function playChime() {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audioCtx = audioCtx ?? new Ctx();
  const ctx = audioCtx;
  const t0 = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = t0 + i * 0.14;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.14);
  });
}

export const wireAlerts = new WireAlertEngine(browserDeps());

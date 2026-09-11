/**
 * server/lib/positioning-notifiers.ts
 * Two positioning broadcast triggers registered into broadcast-notifier.ts:
 *   - cot-positioning : CFTC speculative sentiment band flipping on a major contract
 *   - sector-rotation : a sector crossing into a new RRG quadrant
 *
 * Both read data the app already computes (the COT snapshot and the sector RRG
 * map), so the labels pushed here are the same ones the Markets and Macro tabs
 * display — no second definition of "bullish" or "Leading" to drift.
 */

import { registerBroadcastTrigger } from "./broadcast-notifier";
import { getCotSnapshot, type CotRow } from "../routes/markets";
import { getSectorQuadrants } from "../routes/economy";

// ── CFTC positioning flip ────────────────────────────────────────────────────

/**
 * Only the contracts worth waking someone up for. The COT payload covers ~40
 * across five categories; a positioning flip in Feeder Cattle is not a push.
 */
const WATCHED_COT = new Set(["Gold", "Silver", "Crude Oil", "Copper", "S&P 500"]);

/** Bull-vs-bear side of a sentiment label, or null for the neutral band. Pure. */
export function sentimentSide(sentiment: string | undefined): "bull" | "bear" | null {
  if (!sentiment) return null;
  if (sentiment.includes("Bullish")) return "bull";
  if (sentiment.includes("Bearish")) return "bear";
  return null; // "Neutral"
}

/**
 * A flip is a cross of the neutral zone — bull→bear or bear→bull. Drifting
 * from Bullish to Strongly Bullish is not news, and neither is passing through
 * Neutral on the way. Pure.
 */
export function isPositioningFlip(from: string | undefined, to: string | undefined): boolean {
  const a = sentimentSide(from);
  const b = sentimentSide(to);
  return a !== null && b !== null && a !== b;
}

function cotRowsOfInterest(snapshot: Awaited<ReturnType<typeof getCotSnapshot>>): CotRow[] {
  return [...snapshot.metals, ...snapshot.energy, ...snapshot.indicesRates].filter((r) =>
    WATCHED_COT.has(r.name),
  );
}

/** `name=sentiment` pairs, stable order — the engine's state string. Pure. */
export function encodeCotState(rows: CotRow[]): string {
  return rows
    .map((r) => `${r.name}=${r.sentiment ?? "?"}`)
    .sort()
    .join(",");
}

export function decodeCotState(state: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of state.split(",")) {
    const [name, sentiment] = pair.split("=");
    if (name) map.set(name, sentiment ?? "");
  }
  return map;
}

export function registerCotPositioningTrigger(): void {
  registerBroadcastTrigger({
    id: "cot-positioning-flip",
    intervalMs: 4 * 60 * 60_000, // 4h — CFTC publishes weekly, this just needs to catch the update
    check: async () => {
      const snapshot = await getCotSnapshot();
      const rows = cotRowsOfInterest(snapshot);
      if (rows.length === 0) return null;
      return {
        state: encodeCotState(rows),
        title: "",
        body: "",
        data: {
          reportDate: snapshot.reportDate ?? "",
          ...Object.fromEntries(rows.map((r) => [`longPct_${r.name}`, String(r.longPct ?? "")])),
        },
      };
    },
    // Every weekly COT update shifts some label; only a bull↔bear cross on a
    // watched contract is worth a push.
    shouldNotify: (from, to) => {
      const prev = decodeCotState(from);
      const next = decodeCotState(to);
      for (const [name, sentiment] of next) {
        if (isPositioningFlip(prev.get(name), sentiment)) return true;
      }
      return false;
    },
    renderTransition: (from, to, data) => {
      const prev = decodeCotState(from);
      const next = decodeCotState(to);
      const flips: { name: string; from: string; to: string }[] = [];
      for (const [name, sentiment] of next) {
        const was = prev.get(name);
        if (isPositioningFlip(was, sentiment)) flips.push({ name, from: was ?? "?", to: sentiment });
      }
      const lead = flips[0];
      const direction = sentimentSide(lead?.to) === "bear" ? "net short" : "net long";
      const longPct = data?.[`longPct_${lead?.name}`];
      const pctText = longPct ? ` — ${Number(longPct).toFixed(0)}% long.` : ".";
      const others =
        flips.length > 1 ? ` Also flipped: ${flips.slice(1).map((f) => f.name).join(", ")}.` : "";
      return {
        title: `📋 Hedge funds flipped ${direction} on ${lead?.name ?? "a major contract"}`,
        body: `Speculative positioning moved from ${lead?.from} to ${lead?.to}${pctText}${others}`,
      };
    },
  });
}

// ── Sector rotation (RRG quadrant) ───────────────────────────────────────────

/** `sector=quadrant` pairs, stable order. Pure. */
export function encodeQuadrantState(entries: { name: string; quadrant: string | null }[]): string {
  return entries
    .map((e) => `${e.name}=${e.quadrant ?? "?"}`)
    .sort()
    .join(",");
}

export function decodeQuadrantState(state: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of state.split(",")) {
    const [name, quadrant] = pair.split("=");
    if (name) map.set(name, quadrant ?? "");
  }
  return map;
}

/**
 * Only the two decisive crossings are push-worthy: into Leading (a sector is
 * now outperforming with momentum) and into Lagging (it has lost both). The
 * Improving/Weakening transitions are the noisy middle of the RRG cycle. Pure.
 */
export function notableQuadrantMoves(
  prev: Map<string, string>,
  next: Map<string, string>,
): { name: string; from: string; to: string }[] {
  const out: { name: string; from: string; to: string }[] = [];
  for (const [name, quadrant] of next) {
    const was = prev.get(name);
    if (!was || was === quadrant) continue;
    if (quadrant === "Leading" || quadrant === "Lagging") {
      out.push({ name, from: was, to: quadrant });
    }
  }
  return out;
}

export function registerSectorRotationTrigger(): void {
  registerBroadcastTrigger({
    id: "sector-rotation-quadrant",
    intervalMs: 6 * 60 * 60_000, // 6h — RRG moves on weekly relative-strength data
    cooldownMs: 24 * 60 * 60_000, // at most one rotation push per day
    check: async () => {
      const quadrants = await getSectorQuadrants();
      const entries = [...quadrants.values()].map((s) => ({
        name: s.name,
        quadrant: s.quadrant ?? null,
        emoji: s.emoji ?? "",
      }));
      if (entries.length === 0) return null;
      return {
        state: encodeQuadrantState(entries),
        title: "",
        body: "",
        data: Object.fromEntries(entries.map((e) => [`emoji_${e.name}`, e.emoji])),
      };
    },
    shouldNotify: (from, to) =>
      notableQuadrantMoves(decodeQuadrantState(from), decodeQuadrantState(to)).length > 0,
    renderTransition: (from, to, data) => {
      const moves = notableQuadrantMoves(decodeQuadrantState(from), decodeQuadrantState(to));
      const lead = moves[0];
      const emoji = data?.[`emoji_${lead?.name}`] || "🔄";
      const others =
        moves.length > 1 ? ` Also rotating: ${moves.slice(1).map((m) => `${m.name} → ${m.to}`).join(", ")}.` : "";
      return {
        title: `${emoji} ${lead?.name ?? "A sector"} rotated into ${lead?.to ?? "a new quadrant"}`,
        body: `Moved out of ${lead?.from} on the relative rotation graph.${others}`,
      };
    },
  });
}

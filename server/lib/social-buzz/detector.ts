import type { BuzzEvent } from "./types";

export const NOTABLE_MOVER_THRESHOLD_PCT = 5;

export interface MoverCandidate {
  symbol: string;
  name: string;
  changePercent: number;
}

/**
 * Pure decision logic — no network calls. Callers pass already-fetched data
 * so this stays fixture-testable in isolation.
 */
export function detectNotableMover(
  movers: MoverCandidate[],
  thresholdPct: number = NOTABLE_MOVER_THRESHOLD_PCT,
): BuzzEvent | null {
  let best: MoverCandidate | null = null;
  for (const m of movers) {
    if (Math.abs(m.changePercent) < thresholdPct) continue;
    if (!best || Math.abs(m.changePercent) > Math.abs(best.changePercent)) best = m;
  }
  if (!best) return null;

  const direction = best.changePercent >= 0 ? "up" : "down";
  const pct = Math.abs(best.changePercent).toFixed(1);
  return {
    triggerType: "mover",
    triggerSummary: `${best.symbol} (${best.name}) ${direction} ${pct}%`,
  };
}

/**
 * Only fires on a HOLD -> BUY/SELL transition, not BUY<->SELL noise and not
 * re-confirmations of the same signal. Callers should require the flip to
 * persist across 2 consecutive poll ticks before treating it as notable —
 * this function only judges a single before/after pair.
 */
export function detectSignalFlip(
  symbol: string,
  prevSignal: string | null,
  currSignal: string,
): BuzzEvent | null {
  if (prevSignal === null) return null;
  if (prevSignal === currSignal) return null;
  if (prevSignal !== "HOLD") return null;
  if (currSignal !== "BUY" && currSignal !== "SELL") return null;

  return {
    triggerType: "signal_flip",
    triggerSummary: `${symbol} flipped HOLD → ${currSignal}`,
  };
}

/** Fires on a Fear & Greed classification-band change (e.g. "Fear" -> "Extreme Fear"). */
export function detectFearGreedRegimeChange(
  prev: string | null,
  curr: string,
): BuzzEvent | null {
  if (prev === null) return null;
  if (prev === curr) return null;

  return {
    triggerType: "fear_greed_regime",
    triggerSummary: `Fear & Greed shifted from ${prev} to ${curr}`,
  };
}

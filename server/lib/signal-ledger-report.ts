/**
 * Deterministic aggregation + readiness logic for the forward signal ledger.
 * Pure functions over plain data (no Firestore import) so this is fully unit
 * tested and doesn't depend on a routine's prompt re-deriving the same math
 * correctly every time — see scripts/signal-ledger-status.ts for the runner.
 */

export interface SeriesStatsDoc {
  seriesKey: string; // "{strategyId}|{timeframe}|{version}"
  trades: number;
  wins: number;
  sumReturnPct: number; // already in percent units, e.g. -2.30 means -2.30%
  exitSL: number;
  exitTP: number;
  exitTIMEOUT: number;
}

export function parseSeriesVersion(seriesKey: string): number {
  const parts = seriesKey.split("|");
  const v = Number(parts[2]);
  if (parts.length !== 3 || !Number.isFinite(v)) {
    throw new Error(`malformed seriesKey (expected "id|tf|version"): ${seriesKey}`);
  }
  return v;
}

export function parseSeriesStrategyId(seriesKey: string): string {
  return seriesKey.split("|")[0];
}

/**
 * Splits rollup docs into the current (max-version) series and everything
 * older, which is frozen legacy data from before a prior logic fix and must
 * never be blended into a live decision. Docs with trades === 0 are ignored
 * entirely — they don't count toward maxVersion or either bucket.
 */
export function splitByVersion(docs: SeriesStatsDoc[]): {
  current: SeriesStatsDoc[];
  legacy: SeriesStatsDoc[];
  maxVersion: number;
} {
  const withTrades = docs.filter(d => d.trades > 0);
  if (withTrades.length === 0) return { current: [], legacy: [], maxVersion: 0 };

  const maxVersion = Math.max(...withTrades.map(d => parseSeriesVersion(d.seriesKey)));
  const current = withTrades.filter(d => parseSeriesVersion(d.seriesKey) === maxVersion);
  const legacy = withTrades.filter(d => parseSeriesVersion(d.seriesKey) < maxVersion);
  return { current, legacy, maxVersion };
}

/** A single trade's return can't realistically exceed this in magnitude given the SL/TP geometry. */
const RETURN_PCT_SANITY_BOUND = 20;

export interface StrategySummaryRow {
  strategyId: string;
  seriesKey: string;
  trades: number;
  winRatePct: number;
  avgReturnPct: number | null; // null when the sanity bound is exceeded — treat as a computation bug, not data
}

export function summarizeSeries(docs: SeriesStatsDoc[]): StrategySummaryRow[] {
  return docs
    .map((d): StrategySummaryRow => {
      const avg = Math.round((d.sumReturnPct / d.trades) * 100) / 100;
      return {
        strategyId: parseSeriesStrategyId(d.seriesKey),
        seriesKey: d.seriesKey,
        trades: d.trades,
        winRatePct: Math.round((d.wins / d.trades) * 100),
        avgReturnPct: Math.abs(avg) > RETURN_PCT_SANITY_BOUND ? null : avg,
      };
    })
    .sort((a, b) => b.trades - a.trades);
}

export interface ReadinessInput {
  currentDocs: SeriesStatsDoc[];
  minTrades?: number; // default 300
  minStrategies?: number; // default 10
}

export interface ReadinessVerdict {
  totalTrades: number;
  totalExitSL: number;
  totalExitTP: number;
  totalExitTIMEOUT: number;
  strategyCount: number;
  ready: boolean;
  gates: {
    tradeVolume: boolean;
    strategyBreadth: boolean;
    timeoutMovement: boolean;
  };
  notes: string[];
}

/**
 * Ready only when ALL three gates pass:
 *  1. Enough resolved trades to say anything at all.
 *  2. Spread across enough distinct strategies (not concentrated in 1-2).
 *  3. exitTIMEOUT has moved off zero — otherwise the sample is left-censored
 *     toward whichever barrier sits closer to entry (historically the stop-loss),
 *     which reads artificially bearish no matter how many trades accrue.
 */
export function readinessVerdict(input: ReadinessInput): ReadinessVerdict {
  const { currentDocs, minTrades = 300, minStrategies = 10 } = input;

  const totalTrades = currentDocs.reduce((s, d) => s + d.trades, 0);
  const totalExitSL = currentDocs.reduce((s, d) => s + d.exitSL, 0);
  const totalExitTP = currentDocs.reduce((s, d) => s + d.exitTP, 0);
  const totalExitTIMEOUT = currentDocs.reduce((s, d) => s + d.exitTIMEOUT, 0);
  const strategyCount = new Set(currentDocs.map(d => parseSeriesStrategyId(d.seriesKey))).size;

  const gates = {
    tradeVolume: totalTrades >= minTrades,
    strategyBreadth: strategyCount >= minStrategies,
    timeoutMovement: totalExitTIMEOUT > 0,
  };

  const notes: string[] = [];
  if (!gates.tradeVolume) notes.push(`only ${totalTrades} resolved trades (need >= ${minTrades})`);
  if (!gates.strategyBreadth) notes.push(`only ${strategyCount} strategies represented (need >= ${minStrategies})`);
  if (!gates.timeoutMovement) {
    notes.push(
      "exitTIMEOUT is still 0 — no cohort has completed its full hold yet, so the win-rate " +
      "sample is left-censored toward whichever barrier sits closer to entry (historically the " +
      "stop-loss), which reads artificially bearish regardless of trade count.",
    );
  }

  return {
    totalTrades, totalExitSL, totalExitTP, totalExitTIMEOUT, strategyCount,
    ready: gates.tradeVolume && gates.strategyBreadth && gates.timeoutMovement,
    gates,
    notes,
  };
}

/**
 * Earliest calendar date a cohort captured on `captureStartDate` can post a
 * TIMEOUT exit, given `maxHoldBars` trading days on a daily timeframe. Trading
 * days are approximated as 5/7 of calendar days (holidays aside) — this is an
 * estimate for a heads-up, not a trading-calendar-exact computation.
 */
export function estimateTimeoutEta(captureStartDate: Date, maxHoldBars: number): Date {
  const calendarDays = Math.ceil(maxHoldBars * (7 / 5));
  const eta = new Date(captureStartDate);
  eta.setUTCDate(eta.getUTCDate() + calendarDays);
  return eta;
}

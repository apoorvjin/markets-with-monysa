/**
 * Shared stop-loss/take-profit exit-detection, used by both the historical
 * backtest (runBacktestWithSLTP in trading.ts) and the forward signal ledger's
 * resolution job — so "what counts as a stop-loss hit" can never silently
 * diverge between the two.
 *
 * Structurally typed against ExitBar rather than importing trading.ts's OHLCV
 * type, so this file has zero dependencies.
 */

export type ExitReason = "SL" | "TP" | "TIMEOUT";

export interface ExitBar {
  high: number;
  low: number;
  close: number;
}

export interface ExitCheckResult {
  exitPrice: number;
  exitReason: ExitReason;
  holdBars: number;
}

/**
 * Walks `barsAfterEntry` (chronological, strictly after the entry bar) for the
 * first bar where stopLoss or takeProfit is touched intrabar (high/low). If
 * both are touched in the same bar, SL is assumed to have hit first
 * (conservative). Checks at most `maxHoldBars` bars.
 *
 * Returns a TIMEOUT result once `maxHoldBars` bars have been checked with no
 * hit. Returns null when fewer than `maxHoldBars` bars were supplied and no
 * hit occurred — i.e. "undetermined, not enough time has elapsed yet." The
 * historical backtest (finite series) must treat null as a forced TIMEOUT at
 * the last available close; the live resolution job (open-ended series) must
 * leave the entry open and re-check on the next pass.
 */
export function checkExit(
  barsAfterEntry: ExitBar[],
  direction: "BUY" | "SELL",
  stopLoss: number,
  takeProfit: number,
  maxHoldBars: number,
): ExitCheckResult | null {
  const usable = barsAfterEntry.slice(0, maxHoldBars);
  if (usable.length === 0) return null;

  for (let k = 0; k < usable.length; k++) {
    const bar = usable[k];
    const slHit = direction === "BUY" ? bar.low <= stopLoss : bar.high >= stopLoss;
    const tpHit = direction === "BUY" ? bar.high >= takeProfit : bar.low <= takeProfit;
    if (slHit || tpHit) {
      return {
        exitPrice: (tpHit && !slHit) ? takeProfit : stopLoss,
        exitReason: (tpHit && !slHit) ? "TP" : "SL",
        holdBars: k + 1,
      };
    }
  }

  if (usable.length >= maxHoldBars) {
    const last = usable[usable.length - 1];
    return { exitPrice: last.close, exitReason: "TIMEOUT", holdBars: usable.length };
  }

  return null;
}

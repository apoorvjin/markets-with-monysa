/** Reward-to-risk for a signal, from the entry / stop / target the API already
 *  returns. Nothing displayed this ratio before, even though all three legs
 *  were on screen — and it is the number that decides whether a 70%-confidence
 *  setup is worth taking.
 *
 *  Direction matters: on a BUY the target sits above entry and the stop below;
 *  on a SELL both are inverted. Using abs() on each leg handles either without
 *  branching, and a non-positive risk leg (stop at or beyond entry) yields null
 *  rather than Infinity. */
export function riskReward(
  direction: string | null | undefined,
  entry: number | null | undefined,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
): number | null {
  const dir = (direction ?? "").toUpperCase();
  if (dir !== "BUY" && dir !== "SELL") return null;
  if (entry == null || stopLoss == null || takeProfit == null) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) {
    return null;
  }
  const reward = Math.abs(takeProfit - entry);
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

/** BUY/SELL are actionable; HOLD (and anything unrecognised) is not. */
export function isActionable(direction: string | null | undefined): boolean {
  const d = (direction ?? "").toUpperCase();
  return d === "BUY" || d === "SELL";
}

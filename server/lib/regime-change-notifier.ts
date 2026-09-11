/**
 * server/lib/regime-change-notifier.ts
 * VIX/VIX3M options term-structure trigger, registered into the generic
 * broadcast engine (see broadcast-notifier.ts). Polls every 30 minutes;
 * the engine fires a "broadcast-alerts" FCM topic push only when the label
 * actually changes (e.g. contango -> backwardation), subject to its cooldown.
 */

import { registerBroadcastTrigger } from "./broadcast-notifier";
import { fetchYahooPrice } from "../routes/shared";

type TermLabel = "strong_contango" | "contango" | "flat" | "backwardation";

export function computeTermLabel(vix: number | null, vix3m: number | null): TermLabel | null {
  if (vix == null || vix3m == null || vix === 0) return null;
  const ratio = vix3m / vix;
  if (ratio >= 1.10) return "strong_contango";
  if (ratio >= 1.02) return "contango";
  if (ratio <= 0.97) return "backwardation";
  return "flat";
}

export function registerVixTermStructureTrigger(): void {
  registerBroadcastTrigger({
    id: "vix-term-structure",
    intervalMs: 30 * 60_000,
    cooldownMs: 4 * 60 * 60_000, // at most one notification per 4h even if the ratio flaps at a boundary
    check: async () => {
      const [vixData, vix3mData] = await Promise.all([
        fetchYahooPrice("^VIX"),
        fetchYahooPrice("^VIX3M"),
      ]);
      const label = computeTermLabel(vixData?.price ?? null, vix3mData?.price ?? null);
      if (label === null) return null;

      const vixPrice = vixData?.price ?? 0;
      const vix3mPrice = vix3mData?.price ?? 0;
      const ratio = vixPrice > 0 ? (vix3mPrice / vixPrice).toFixed(3) : "?";

      return {
        state: label,
        title: "Options Regime Change",
        body: `VIX term structure shifted to ${label.replace(/_/g, " ")} (VIX3M/VIX: ${ratio})`,
        data: { ratio },
      };
    },
  });
}

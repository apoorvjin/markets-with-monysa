/**
 * server/lib/regime-change-notifier.ts
 * Leader-only background job that polls VIX / VIX3M every 30 minutes and sends
 * an FCM topic push notification when the options market regime label changes
 * (e.g. contango → backwardation). Clients subscribe to the "regime-changes" topic.
 */

import { isLeader } from "./leader";
import { adminMessaging } from "./firebase-admin";
import { fetchYahooPrice } from "../routes/shared";

type TermLabel = "strong_contango" | "contango" | "flat" | "backwardation";

let _lastLabel: TermLabel | null = null;

function computeTermLabel(vix: number | null, vix3m: number | null): TermLabel | null {
  if (vix == null || vix3m == null || vix === 0) return null;
  const ratio = vix3m / vix;
  if (ratio >= 1.10) return "strong_contango";
  if (ratio >= 1.02) return "contango";
  if (ratio <= 0.97) return "backwardation";
  return "flat";
}

async function checkAndNotify(): Promise<void> {
  if (!isLeader()) return;
  try {
    const [vixData, vix3mData] = await Promise.all([
      fetchYahooPrice("^VIX"),
      fetchYahooPrice("^VIX3M"),
    ]);
    const label = computeTermLabel(vixData?.price ?? null, vix3mData?.price ?? null);
    if (label === null) return;

    if (_lastLabel !== null && label !== _lastLabel) {
      const messaging = adminMessaging();
      if (messaging) {
        const vixPrice = vixData?.price ?? 0;
        const vix3mPrice = vix3mData?.price ?? 0;
        const ratio = vixPrice > 0 ? (vix3mPrice / vixPrice).toFixed(3) : "?";
        await messaging.send({
          topic: "regime-changes",
          notification: {
            title: "Options Regime Change",
            body: `VIX term structure shifted to ${label.replace(/_/g, " ")} (VIX3M/VIX: ${ratio})`,
          },
          data: { termLabel: label, ratio },
          android: { priority: "normal" },
          apns: { payload: { aps: { sound: "default" } } },
        }).catch(e => console.error("[regime-notifier] FCM send failed:", e));
        console.log(`[regime-notifier] regime changed ${_lastLabel} → ${label}`);
      }
    }
    _lastLabel = label;
  } catch (e) {
    console.error("[regime-notifier] check failed:", e);
  }
}

export function startRegimeChangeNotifier(): void {
  void checkAndNotify();
  setInterval(() => void checkAndNotify(), 30 * 60_000);
}

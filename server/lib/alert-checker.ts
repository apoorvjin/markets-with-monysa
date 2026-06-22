/**
 * server/lib/alert-checker.ts
 * Leader-only background job that checks price alerts every 20 s and sends
 * Firebase Cloud Messaging push notifications when an alert triggers.
 *
 * Alert Firestore schema (set by Flutter client):
 *   users/{uid}/alerts/{alertId}
 *     symbol:       string
 *     name:         string
 *     targetPrice:  number
 *     direction:    "above" | "below"
 *     triggered:    bool (false until we fire here)
 *     triggeredAt:  string | null
 *     createdAt:    string
 *
 * Device FCM token schema:
 *   users/{uid}/devices/{deviceId}
 *     fcmToken:  string
 *     platform:  "ios" | "android"
 *     updatedAt: string
 */

import { isLeader } from "./leader";
import { adminFirestore, adminMessaging } from "./firebase-admin";
import { latestPrices } from "../trading";

interface CachedAlert {
  uid: string;
  alertId: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: "above" | "below";
}

let _cache: CachedAlert[] = [];
let _lastFetch = 0;
const CACHE_TTL_MS = 5 * 60_000; // refresh Firestore every 5 min

async function loadAlerts(): Promise<void> {
  const db = adminFirestore();
  if (!db) return;
  try {
    const snap = await db
      .collectionGroup("alerts")
      .where("triggered", "==", false)
      .get();
    _cache = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        uid: doc.ref.parent.parent?.id ?? "",
        alertId: doc.id,
        symbol: d.symbol as string,
        name: d.name as string,
        targetPrice: d.targetPrice as number,
        direction: d.direction as "above" | "below",
      };
    });
    _lastFetch = Date.now();
    if (_cache.length > 0) {
      console.log(`[alert-checker] ${_cache.length} active alert(s) cached`);
    }
  } catch (e) {
    console.error("[alert-checker] loadAlerts failed:", e);
  }
}

async function firePushForAlert(alert: CachedAlert, price: number): Promise<void> {
  const db = adminFirestore();
  const messaging = adminMessaging();

  // Mark triggered before sending so a crash loop doesn't spam the user.
  if (db) {
    db.collection("users")
      .doc(alert.uid)
      .collection("alerts")
      .doc(alert.alertId)
      .update({ triggered: true, triggeredAt: new Date().toISOString() })
      .catch((e) => console.error("[alert-checker] Firestore update failed:", e));
  }

  // Remove from local cache immediately.
  _cache = _cache.filter(
    (a) => !(a.uid === alert.uid && a.alertId === alert.alertId),
  );

  if (!messaging || !db) return;

  try {
    const devSnap = await db
      .collection("users")
      .doc(alert.uid)
      .collection("devices")
      .get();
    const tokens = devSnap.docs
      .map((d) => d.data().fcmToken as string | undefined)
      .filter((t): t is string => !!t);

    if (tokens.length === 0) return;

    const verb = alert.direction === "above" ? "rose above" : "fell below";
    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `Alert: ${alert.name}`,
        body: `${alert.symbol} ${verb} $${alert.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      },
      data: {
        symbol: alert.symbol,
        price: String(price),
        alertId: alert.alertId,
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    });
    console.log(`[alert-checker] Push sent: ${alert.symbol} → uid=${alert.uid}`);
  } catch (e) {
    console.error("[alert-checker] FCM send failed:", e);
  }
}

async function tick(): Promise<void> {
  // Refresh Firestore cache when stale.
  if (Date.now() - _lastFetch >= CACHE_TTL_MS) {
    await loadAlerts();
  }
  if (_cache.length === 0) return;

  const fires: Promise<void>[] = [];
  for (const alert of _cache) {
    const entry = latestPrices.get(alert.symbol);
    if (!entry) continue;
    const hit =
      alert.direction === "above"
        ? entry.price >= alert.targetPrice
        : entry.price <= alert.targetPrice;
    if (hit) {
      fires.push(firePushForAlert(alert, entry.price));
    }
  }
  if (fires.length > 0) await Promise.allSettled(fires);
}

/** Start the leader-only alert checker.  Call once at server startup. */
export function startAlertChecker(): void {
  // Initial Firestore load.
  loadAlerts();

  // Runs every 20 s, same cadence as the price poll that refreshes latestPrices.
  setInterval(() => {
    if (!isLeader()) return;
    tick().catch((e) => console.error("[alert-checker] tick error:", e));
  }, 20_000);
}

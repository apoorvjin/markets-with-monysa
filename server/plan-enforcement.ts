import type { Request } from "express";
import { adminFirestore } from "./lib/firebase-admin";

export type DevicePlan = "free" | "pro" | "enterprise";

export const enforcementEnabled = !!process.env.APP_SIGNING_SECRET;

// In-process cache — authoritative for request-time lookups.
// Seeded from Firestore on startup; updated in real-time via billing webhook.
export const devicePlanMap = new Map<string, DevicePlan>();

/** Persist a plan change to Firestore (fire-and-forget — never blocks the webhook response). */
export function persistPlan(deviceId: string, plan: DevicePlan, event: string): void {
  const db = adminFirestore();
  if (!db) return;
  db.collection("subscriptions").doc(deviceId).set(
    { plan, event, updatedAt: new Date().toISOString() },
    { merge: true },
  ).catch((e) => console.error("[plan-enforcement] Firestore write failed:", e));
}

/** Load all persisted plans from Firestore into the in-process cache.
 *  Called once at startup so plans survive server restarts. */
export async function loadPlansFromFirestore(): Promise<void> {
  const db = adminFirestore();
  if (!db) {
    console.log("[plan-enforcement] Firestore unavailable — skipping plan load (dev mode)");
    return;
  }
  try {
    const snap = await db.collection("subscriptions").get();
    snap.docs.forEach((doc) => {
      const { plan } = doc.data() as { plan?: DevicePlan };
      if (plan) devicePlanMap.set(doc.id, plan);
    });
    console.log(`[plan-enforcement] Loaded ${snap.size} plans from Firestore`);
  } catch (e) {
    console.error("[plan-enforcement] Failed to load plans from Firestore:", e);
  }
}

export function getDevicePlan(req: Request): DevicePlan {
  if (!enforcementEnabled) return "enterprise"; // dev: unrestricted
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) return "free";
  return devicePlanMap.get(deviceId) ?? "free";
}

export function isPro(plan: DevicePlan): boolean {
  return plan === "pro" || plan === "enterprise";
}

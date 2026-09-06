import { adminFirestore } from "./firebase-admin";
import type { DevicePlan } from "../plan-enforcement";

// Audit trail for the admin portal's User/Billing lookup — every RevenueCat
// webhook event (server/routes/billing.ts) and every manual admin plan
// override (server/routes/admin.ts) writes here, so "why is this user on
// Free" is answerable from the portal instead of grepping Fly logs.
// Fire-and-forget, same non-blocking pattern as plan-enforcement's
// persistPlan(): never delays the caller (the webhook response RevenueCat is
// waiting on, or the admin PATCH response).
export function recordBillingEvent(deviceId: string, type: string, plan: DevicePlan, entitlementIds: string[] = []): void {
  const db = adminFirestore();
  if (!db) return;
  db.collection("billing_events").add({
    deviceId,
    type,
    plan,
    entitlementIds,
    receivedAt: new Date().toISOString(),
  }).catch((e) => console.error("[billing-events] Failed to record event:", e));
}

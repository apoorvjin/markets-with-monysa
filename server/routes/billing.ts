import type { Express } from "express";
import { devicePlanMap, persistPlan, type DevicePlan } from "../plan-enforcement";

const REVENUECAT_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;

// Identifier-agnostic: ANY active entitlement = Pro. We must NOT match a
// specific entitlement id here — if the RevenueCat dashboard entitlement is
// renamed, a paying user would otherwise be mapped to Free and get 403s on
// plan-gated endpoints. Mirrors EntitlementService.updateFromCustomerInfo.
function entitlementsToPlan(entitlementIds: string[]): DevicePlan {
  return entitlementIds.length > 0 ? "pro" : "free";
}

export function registerBillingRoutes(app: Express): void {
  app.post("/api/billing/webhook", (req, res) => {
    if (REVENUECAT_WEBHOOK_SECRET) {
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const event = req.body?.event;
    if (!event || typeof event !== "object") {
      return res.status(400).json({ error: "Missing or invalid event" });
    }

    const { type, app_user_id: deviceId, entitlement_ids } = event as {
      type: string;
      app_user_id?: string;
      entitlement_ids?: string[];
    };

    if (!deviceId) {
      return res.status(400).json({ error: "Missing app_user_id" });
    }

    switch (type) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
      case "UNCANCELLATION": {
        const plan = entitlementsToPlan(entitlement_ids ?? []);
        devicePlanMap.set(deviceId, plan);
        persistPlan(deviceId, plan, type);
        console.log(`[billing] ${type}: device=${deviceId} plan=${plan}`);
        break;
      }
      case "CANCELLATION":
      case "EXPIRATION":
      case "BILLING_ISSUE": {
        devicePlanMap.set(deviceId, "free");
        persistPlan(deviceId, "free", type);
        console.log(`[billing] ${type}: device=${deviceId} → free`);
        break;
      }
      default:
        console.log(`[billing] Unhandled event type: ${type}`);
    }

    return res.json({ ok: true });
  });
}

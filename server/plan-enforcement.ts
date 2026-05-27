/**
 * server/plan-enforcement.ts
 * Shared plan/entitlement enforcement helpers used by trading and exposure routes.
 *
 * Enforcement is skipped when APP_SIGNING_SECRET is unset (dev mode) — consistent
 * with the HMAC signing middleware behaviour. In dev every device is unrestricted.
 *
 * devicePlanMap is populated by RevenueCat webhooks (billing route, Week 5).
 * Until then it's empty, so all devices are treated as "free".
 */

import type { Request } from "express";

export type DevicePlan = "free" | "pro" | "insight" | "enterprise";

export const enforcementEnabled = !!process.env.APP_SIGNING_SECRET;

export const devicePlanMap = new Map<string, DevicePlan>();

export function getDevicePlan(req: Request): DevicePlan {
  if (!enforcementEnabled) return "enterprise"; // dev: unrestricted
  const deviceId = req.headers["x-device-id"] as string | undefined;
  if (!deviceId) return "free";
  return devicePlanMap.get(deviceId) ?? "free";
}

export function isPro(plan: DevicePlan): boolean {
  return plan === "pro" || plan === "insight" || plan === "enterprise";
}

export function isInsight(plan: DevicePlan): boolean {
  return plan === "insight" || plan === "enterprise";
}

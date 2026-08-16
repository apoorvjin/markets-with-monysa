import { z } from "zod";

/** GET /api/me — the signed-in user's identity + entitlement, resolved server-side
 *  from a verified Firebase ID token. `plan` mirrors the mobile Plan enum
 *  (free/pro); ANY active RevenueCat entitlement = "pro". */
export const MeResponse = z
  .object({
    uid: z.string(),
    email: z.string().nullable(),
    emailVerified: z.boolean(),
    displayName: z.string().nullable(),
    plan: z.enum(["free", "pro"]),
  })
  .passthrough();

export type MeResponse = z.infer<typeof MeResponse>;

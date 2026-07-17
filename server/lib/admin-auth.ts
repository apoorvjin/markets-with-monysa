/**
 * Shared Bearer-token auth middleware for /api/admin/* routes.
 * Extracted from routes/admin.ts so routes/social-buzz.ts can reuse the same
 * ADMIN_SECRET check without a second auth mechanism.
 */

import type { Request, Response } from "express";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export function authMiddleware(req: Request, res: Response, next: () => void) {
  if (!ADMIN_SECRET) {
    return res.status(503).json({ error: "ADMIN_SECRET not configured" });
  }
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/**
 * server/routes/admin.ts
 * Admin-only API for reading and updating Firebase Remote Config.
 * Protected by ADMIN_SECRET env var (Bearer token).
 *
 * GET  /api/admin/remote-config          → returns all parameters + their values
 * PATCH /api/admin/remote-config         → update one or more parameters
 * POST  /api/admin/remote-config/publish → publish pending template changes
 *
 * Usage (curl):
 *   curl -H "Authorization: Bearer $ADMIN_SECRET" http://localhost:5001/api/admin/remote-config
 *   curl -X PATCH -H "Authorization: Bearer $ADMIN_SECRET" \
 *        -H "Content-Type: application/json" \
 *        -d '{"pro_monthly_price_usd":"9.99","alert_limit_free":"5"}' \
 *        http://localhost:5001/api/admin/remote-config
 */

import type { Express, Request, Response } from "express";
import { adminRemoteConfig } from "../lib/firebase-admin";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function authMiddleware(req: Request, res: Response, next: () => void) {
  if (!ADMIN_SECRET) {
    return res.status(503).json({ error: "ADMIN_SECRET not configured" });
  }
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function registerAdminRoutes(app: Express): void {
  // GET /api/admin/remote-config — read all parameter values from current template
  app.get("/api/admin/remote-config", authMiddleware, async (_req, res) => {
    const rc = adminRemoteConfig();
    if (!rc) return res.status(503).json({ error: "Firebase Admin not initialised — set FIREBASE_SERVICE_ACCOUNT_JSON" });

    try {
      const template = await rc.getTemplate();
      const params: Record<string, { defaultValue: unknown; description?: string }> = {};
      for (const [key, param] of Object.entries(template.parameters ?? {})) {
        params[key] = {
          defaultValue: (param.defaultValue as { value?: string })?.value ?? null,
          description: param.description,
        };
      }
      return res.json({ params, version: template.version });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /api/admin/remote-config — update parameter default values and auto-publish
  app.patch("/api/admin/remote-config", authMiddleware, async (req, res) => {
    const rc = adminRemoteConfig();
    if (!rc) return res.status(503).json({ error: "Firebase Admin not initialised — set FIREBASE_SERVICE_ACCOUNT_JSON" });

    const updates = req.body as Record<string, string>;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res.status(400).json({ error: "Body must be a flat { key: value } object" });
    }

    try {
      const template = await rc.getTemplate();
      template.parameters = template.parameters ?? {};
      for (const [key, value] of Object.entries(updates)) {
        if (template.parameters[key]) {
          template.parameters[key].defaultValue = { value: String(value) };
        } else {
          template.parameters[key] = { defaultValue: { value: String(value) } };
        }
      }
      const published = await rc.publishTemplate(template);
      console.log(`[admin] Remote Config updated: ${Object.keys(updates).join(", ")}`);
      return res.json({ ok: true, version: published.version });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });
}

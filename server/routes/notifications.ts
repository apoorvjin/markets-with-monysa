import type { Express } from "express";
import { adminFirestore } from "../lib/firebase-admin";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface NotificationLogItem {
  id: string;
  triggerId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  firedAt: string;
}

export function registerNotificationsRoutes(app: Express): void {
  // Read-only history of every broadcast-notifier firing — powers the bell
  // icon / notification history on both clients, independent of whether the
  // OS push itself was seen. Free, unauthenticated, not plan-gated.
  app.get("/api/notifications/log", async (req, res) => {
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

    const db = adminFirestore();
    if (!db) {
      return res.json({ items: [], lastUpdated: new Date().toISOString() });
    }

    try {
      const snap = await db.collection("notification_log").orderBy("firedAt", "desc").limit(limit).get();
      const items: NotificationLogItem[] = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          triggerId: d.triggerId ?? "",
          title: d.title ?? "",
          body: d.body ?? "",
          data: d.data ?? {},
          firedAt: d.firedAt ?? "",
        };
      });
      // Short public cache — non-plan-gated, changes at most a handful of
      // times a day, mirrors /api/wire/items' Cache-Control pattern.
      res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      res.json({ items, lastUpdated: new Date().toISOString() });
    } catch (e) {
      console.error("[notifications] log query failed:", e);
      res.status(500).json({ error: "Failed to load notification log" });
    }
  });
}

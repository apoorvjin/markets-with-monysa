/**
 * server/routes/admin.ts
 * Admin-only API. Protected by ADMIN_SECRET env var (Bearer token).
 *
 * Remote Config:
 *   GET   /api/admin/remote-config
 *   PATCH /api/admin/remote-config
 *
 * Stats:
 *   GET   /api/admin/stats
 *   GET   /api/admin/leader
 *
 * Users (Firestore):
 *   GET    /api/admin/users?limit=50&startAfter=<uid>
 *   GET    /api/admin/users/:uid/alerts
 *   DELETE /api/admin/users/:uid/alerts/:alertId
 *   GET    /api/admin/users/:uid/devices
 *   POST   /api/admin/users/:uid/devices/:deviceId/notify
 *
 * Alerts (collectionGroup):
 *   GET    /api/admin/alerts?limit=100&startAfter=<docPath>&triggered=all|true|false
 *
 * Subscriptions:
 *   GET   /api/admin/subscriptions?limit=100&startAfter=<deviceId>
 *   PATCH /api/admin/subscriptions/:deviceId
 *
 * Notifications:
 *   POST  /api/admin/fcm/broadcast
 *
 * Cache busting:
 *   POST  /api/admin/cache/bust   body: { target: "bonds"|"sectors"|"tariffs"|"briefing"|"fear-greed"|"oge"|"heatmap"|"treemap"|"market-quotes" }
 *
 * OGE pipeline:
 *   POST  /api/admin/oge/refresh
 */

import type { Express, Request, Response } from "express";
import { spawn } from "child_process";
import { adminAuth, adminFirestore, adminMessaging, adminRemoteConfig } from "../lib/firebase-admin";
import { devicePlanMap, persistPlan, type DevicePlan } from "../plan-enforcement";
import { isLeader, machineId } from "../lib/leader";
import { bustBondsCache, bustSectorsCache, bustTariffsCache } from "./economy";
import { bustBriefingCache, bustFearGreedCache } from "./volatility";
import { bustCache as bustOgeCache } from "./oge";
import { bustHeatmapCache, bustTreemapCache } from "./heatmap";
import { bustMarketQuotesCache } from "./markets";
import { normaliseRoute } from "../lib/route-normalizer";
import { pagesFor } from "../lib/page-api-map";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Firestore Timestamps are objects with a toDate() method — convert to ISO string for JSON serialisation.
function serializeFirestoreDoc(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof (v as any).toDate === "function") {
      out[k] = (v as any).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

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

  // ── Remote Config ─────────────────────────────────────────────────────────

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

  // ── Stats ─────────────────────────────────────────────────────────────────

  app.get("/api/admin/stats", authMiddleware, async (_req, res) => {
    const db = adminFirestore();
    let userCount = 0;
    let alertCount = 0;

    if (db) {
      try {
        const [usersSnap, alertsSnap] = await Promise.all([
          db.collection("users").count().get(),
          db.collectionGroup("alerts").where("triggered", "==", false).count().get(),
        ]);
        userCount = usersSnap.data().count;
        alertCount = alertsSnap.data().count;
      } catch (e) {
        console.error("[admin] stats Firestore query failed:", e);
      }
    }

    const planCounts = { free: 0, pro: 0 };
    for (const plan of devicePlanMap.values()) {
      if (plan === "free") planCounts.free++;
      else if (plan === "pro") planCounts.pro++;
    }

    return res.json({
      userCount,
      alertCount,
      planCounts,
      subscriptionCount: devicePlanMap.size,
      leaderStatus: { isLeader: isLeader(), machineId: machineId() },
    });
  });

  // ── Leader ────────────────────────────────────────────────────────────────

  app.get("/api/admin/leader", authMiddleware, (_req, res) => {
    return res.json({ isLeader: isLeader(), machineId: machineId() });
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  app.get("/api/admin/users", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });

    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const startAfter = req.query.startAfter as string | undefined;

    try {
      let q = db.collection("users").orderBy("createdAt", "desc").limit(limit + 1);
      if (startAfter) {
        const startDoc = await db.collection("users").doc(startAfter).get();
        if (startDoc.exists) q = q.startAfter(startDoc);
      }
      const snap = await q.get();
      const hasMore = snap.docs.length > limit;
      const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      const users = docs.map((d) => ({ uid: d.id, ...serializeFirestoreDoc(d.data()) }));
      return res.json({ users, hasMore });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/admin/users/:uid/alerts", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });
    const uid = req.params.uid as string;
    try {
      const snap = await db.collection("users").doc(uid).collection("alerts").orderBy("createdAt", "desc").get();
      const alerts = snap.docs.map((d) => ({ id: d.id, ...serializeFirestoreDoc(d.data()) }));
      return res.json({ alerts });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.delete("/api/admin/users/:uid/alerts/:alertId", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });
    const uid = req.params.uid as string;
    const alertId = req.params.alertId as string;
    try {
      await db.collection("users").doc(uid).collection("alerts").doc(alertId).delete();
      console.log(`[admin] Deleted alert ${alertId} for uid=${uid}`);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  // Revoke all refresh tokens — forces re-login on all devices immediately.
  app.post("/api/admin/users/:uid/revoke-sessions", authMiddleware, async (req, res) => {
    const auth = adminAuth();
    const uid = req.params.uid as string;
    if (!auth) return res.status(503).json({ error: "Firebase Auth unavailable" });
    try {
      await auth.revokeRefreshTokens(uid);
      console.log(`[admin] Revoked sessions for uid=${uid}`);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  // Generate a password reset link (displayed in admin UI for manual delivery).
  app.post("/api/admin/users/:uid/reset-password", authMiddleware, async (req, res) => {
    const auth = adminAuth();
    const uid = req.params.uid as string;
    if (!auth) return res.status(503).json({ error: "Firebase Auth unavailable" });
    try {
      const userRecord = await auth.getUser(uid);
      if (!userRecord.email) return res.status(400).json({ error: "User has no email address" });
      const resetLink = await auth.generatePasswordResetLink(userRecord.email);
      console.log(`[admin] Generated password reset link for uid=${uid}`);
      return res.json({ ok: true, resetLink });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  // Delete a user: removes Auth account + Firestore doc + known subcollections (alerts, devices).
  app.delete("/api/admin/users/:uid", authMiddleware, async (req, res) => {
    const auth = adminAuth();
    const db = adminFirestore();
    const uid = req.params.uid as string;
    if (!auth) return res.status(503).json({ error: "Firebase Auth unavailable" });
    try {
      // Delete known subcollections first so Firestore doc deletion doesn't leave orphans.
      if (db) {
        const deleteSubcollection = async (sub: string) => {
          const snap = await db.collection("users").doc(uid).collection(sub).get();
          const batches: Promise<unknown>[] = [];
          for (const doc of snap.docs) batches.push(doc.ref.delete());
          await Promise.allSettled(batches);
        };
        await Promise.allSettled([deleteSubcollection("alerts"), deleteSubcollection("devices")]);
        await db.collection("users").doc(uid).delete();
      }
      await auth.deleteUser(uid);
      console.log(`[admin] Deleted user uid=${uid}`);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/admin/users/:uid/devices", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });
    const uid = req.params.uid as string;
    try {
      const snap = await db.collection("users").doc(uid).collection("devices").get();
      const devices = snap.docs.map((d) => ({ deviceId: d.id, ...serializeFirestoreDoc(d.data()) }));
      return res.json({ devices });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.post("/api/admin/users/:uid/devices/:deviceId/notify", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    const messaging = adminMessaging();
    if (!db || !messaging) return res.status(503).json({ error: "Firebase unavailable" });
    const uid = req.params.uid as string;
    const deviceId = req.params.deviceId as string;

    const { title, body } = req.body as { title?: string; body?: string };
    if (!title || !body) return res.status(400).json({ error: "title and body required" });

    try {
      const devDoc = await db.collection("users").doc(uid).collection("devices").doc(deviceId).get();
      if (!devDoc.exists) return res.status(404).json({ error: "Device not found" });
      const fcmToken = devDoc.data()?.fcmToken as string | undefined;
      if (!fcmToken) return res.status(400).json({ error: "No FCM token for this device" });

      const result = await messaging.send({ token: fcmToken, notification: { title, body }, android: { priority: "high" }, apns: { payload: { aps: { sound: "default" } } } });
      console.log(`[admin] Test push sent to uid=${uid} device=${deviceId}`);
      return res.json({ ok: true, messageId: result });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  // ── Alerts (global collectionGroup) ───────────────────────────────────────

  app.get("/api/admin/alerts", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });

    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const triggeredParam = req.query.triggered as string | undefined;
    const startAfterPath = req.query.startAfter as string | undefined;

    try {
      let q = db.collectionGroup("alerts").orderBy("createdAt", "desc").limit(limit + 1) as FirebaseFirestore.Query;
      if (triggeredParam === "true") q = q.where("triggered", "==", true);
      else if (triggeredParam === "false") q = q.where("triggered", "==", false);
      if (startAfterPath) {
        const startDoc = await db.doc(startAfterPath).get();
        if (startDoc.exists) q = q.startAfter(startDoc);
      }
      const snap = await q.get();
      const hasMore = snap.docs.length > limit;
      const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      const alerts = docs.map((d) => ({
        id: d.id,
        uid: d.ref.parent.parent?.id ?? "",
        docPath: d.ref.path,
        ...serializeFirestoreDoc(d.data()),
      }));
      return res.json({ alerts, hasMore });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  // ── Subscriptions ─────────────────────────────────────────────────────────

  app.get("/api/admin/subscriptions", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    if (!db) return res.status(503).json({ error: "Firestore unavailable" });

    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
    const startAfter = req.query.startAfter as string | undefined;

    try {
      let q = db.collection("subscriptions").orderBy("updatedAt", "desc").limit(limit + 1);
      if (startAfter) {
        const startDoc = await db.collection("subscriptions").doc(startAfter).get();
        if (startDoc.exists) q = q.startAfter(startDoc);
      }
      const snap = await q.get();
      const hasMore = snap.docs.length > limit;
      const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;
      const subs = docs.map((d) => ({ deviceId: d.id, ...serializeFirestoreDoc(d.data()) }));
      return res.json({ subs, hasMore });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  app.patch("/api/admin/subscriptions/:deviceId", authMiddleware, async (req, res) => {
    const deviceId = req.params.deviceId as string;
    const { plan } = req.body as { plan?: string };
    if (!plan || !["free", "pro"].includes(plan)) {
      return res.status(400).json({ error: "plan must be free|pro" });
    }
    const typedPlan = plan as DevicePlan;
    devicePlanMap.set(deviceId, typedPlan);
    persistPlan(deviceId, typedPlan, "admin_override");
    console.log(`[admin] Plan override: device=${deviceId} → ${plan}`);
    return res.json({ ok: true, deviceId, plan: typedPlan });
  });

  app.delete("/api/admin/subscriptions/:deviceId", authMiddleware, async (req, res) => {
    const deviceId = req.params.deviceId as string;
    const db = adminFirestore();
    devicePlanMap.delete(deviceId);
    if (db) {
      try {
        await db.collection("subscriptions").doc(deviceId).delete();
      } catch (e) {
        console.error("[admin] Subscription delete Firestore error:", e);
      }
    }
    console.log(`[admin] Subscription removed: device=${deviceId}`);
    return res.json({ ok: true });
  });

  // ── FCM Broadcast ─────────────────────────────────────────────────────────

  app.post("/api/admin/fcm/broadcast", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    const messaging = adminMessaging();
    if (!db || !messaging) return res.status(503).json({ error: "Firebase unavailable" });

    const { title, body, uids } = req.body as { title?: string; body?: string; uids?: string[] };
    if (!title || !body) return res.status(400).json({ error: "title and body required" });

    try {
      let tokenQuery: FirebaseFirestore.Query = db.collectionGroup("devices");
      const snap = await tokenQuery.get();

      const tokens: string[] = [];
      for (const doc of snap.docs) {
        const uid = doc.ref.parent.parent?.id;
        if (uids && uids.length > 0 && uid && !uids.includes(uid)) continue;
        const fcmToken = doc.data().fcmToken as string | undefined;
        if (fcmToken) tokens.push(fcmToken);
      }

      if (tokens.length === 0) return res.json({ ok: true, sent: 0, failed: 0 });

      const BATCH = 500;
      let sent = 0;
      let failed = 0;
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        const result = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          android: { priority: "high" },
          apns: { payload: { aps: { sound: "default" } } },
        });
        sent += result.successCount;
        failed += result.failureCount;
      }
      console.log(`[admin] Broadcast push: sent=${sent} failed=${failed}`);
      return res.json({ ok: true, sent, failed });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  // ── Cache Busting ─────────────────────────────────────────────────────────

  app.post("/api/admin/cache/bust", authMiddleware, async (req, res) => {
    const { target } = req.body as { target?: string };
    switch (target) {
      case "bonds":         bustBondsCache();         break;
      case "sectors":       bustSectorsCache();       break;
      case "tariffs":       bustTariffsCache();       break;
      case "briefing":      bustBriefingCache();      break;
      case "fear-greed":    bustFearGreedCache();     break;
      case "oge":           await bustOgeCache();     break;
      case "heatmap":       bustHeatmapCache();       break;
      case "treemap":       bustTreemapCache();       break;
      case "market-quotes": bustMarketQuotesCache();  break;
      default:
        return res.status(400).json({ error: "target must be: bonds|sectors|tariffs|briefing|fear-greed|oge|heatmap|treemap|market-quotes" });
    }
    console.log(`[admin] Cache busted: ${target}`);
    return res.json({ ok: true, target });
  });

  // ── OGE Pipeline Refresh ─────────────────────────────────────────────────

  app.post("/api/admin/oge/refresh", authMiddleware, async (_req, res) => {
    await bustOgeCache();
    console.log("[admin] OGE cache busted via admin — pipeline will re-run on next GET");
    return res.json({ ok: true });
  });

  // ── AI Call Usage per Device/User ────────────────────────────────────────

  app.get("/api/admin/ai-usage", authMiddleware, async (req, res) => {
    const db = adminFirestore();
    if (!db) return res.json({ rows: [], generatedAt: new Date().toISOString(), error: "Firestore not configured" });

    // 1. Fetch all ai_usage docs
    const usageDocs = await db.collection("ai_usage").get();

    // 2. Build deviceId → email map by scanning users/{uid}/devices subcollections
    const emailMap = new Map<string, string>();
    const users = await db.collection("users").get();
    await Promise.all(users.docs.map(async (userDoc) => {
      const email = (userDoc.data().email as string | undefined) ?? "";
      const devices = await userDoc.ref.collection("devices").get();
      for (const d of devices.docs) emailMap.set(d.id, email || userDoc.id);
    }));

    // 3. Shape and sort by total calls descending
    const rows = usageDocs.docs.map((doc) => {
      const d = doc.data();
      return {
        deviceId:       doc.id,
        email:          emailMap.get(doc.id) ?? null,
        openaiCalls:    (d.openaiCalls    as number | undefined) ?? 0,
        anthropicCalls: (d.anthropicCalls as number | undefined) ?? 0,
        lastSeen:       (d.lastSeen       as string | undefined) ?? null,
        routes:         (d.routes         as Record<string, number> | undefined) ?? {},
      };
    }).sort((a, b) => (b.openaiCalls + b.anthropicCalls) - (a.openaiCalls + a.anthropicCalls));

    return res.json({ rows, generatedAt: new Date().toISOString() });
  });

  // ── API Performance Metrics (from Fly.io logs) ───────────────────────────

  app.get("/api/admin/logs/metrics", authMiddleware, async (req, res) => {
    const appName = process.env.FLY_APP_NAME;
    const token   = process.env.FLY_API_TOKEN;
    if (!appName || !token) {
      return res.json({ available: false, reason: "FLY_APP_NAME/FLY_API_TOKEN not set — metrics only available on Fly.io" });
    }

    const win = (req.query["window"] as string) ?? "1h";
    const windowMs = win === "24h" ? 86_400_000 : win === "6h" ? 21_600_000 : 3_600_000;
    const cutoff = Date.now() - windowMs;

    // fly logs --no-tail --json fetches the recent buffered logs from Fly.io and exits.
    // The fly CLI is installed locally and picks up FLY_API_TOKEN from the environment.
    let ndjson: string;
    try {
      const flyBin = process.env.FLY_BIN ?? "fly";
      ndjson = await new Promise<string>((resolve, reject) => {
        const child = spawn(flyBin, ["logs", "--app", appName, "--json", "--no-tail"], {
          env: { ...process.env },
        });
        const chunks: string[] = [];
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(chunks.join("")); } };
        child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
        child.on("close", finish);
        child.on("error", (e) => { if (!settled) { settled = true; reject(e); } });
        setTimeout(() => { child.kill(); finish(); }, 20_000);
      });
    } catch (e) {
      return res.json({ available: false, reason: `fly CLI error: ${String(e)}. Make sure 'fly' is installed and you are logged in (fly auth login).` });
    }

    // fly logs --json outputs pretty-printed objects separated by \n}\n{ (not NDJSON).
    // Reconstruct each object by splitting on the object boundary then re-wrapping.
    const raw = ndjson.trim();
    const parts = raw ? raw.split(/\n\}\n\{/) : [];
    const entries = parts.map((part, i) => {
      let s = part;
      if (i > 0) s = "{" + s;
      if (i < parts.length - 1) s = s + "}";
      try { return JSON.parse(s) as { message?: string; timestamp?: string }; } catch { return null; }
    }).filter((e): e is { message?: string; timestamp?: string } => e !== null);

    const TIMING_RE = /\[TIMING\] (\w+) (\S+) (\d+) in (\d+)ms/;
    const buckets = new Map<string, number[]>();
    const errCounts = new Map<string, number>();
    const totals  = new Map<string, number>();

    for (const entry of entries) {
      if (entry.timestamp && new Date(entry.timestamp).getTime() < cutoff) continue;
      const msg = entry.message ?? "";
      const m = TIMING_RE.exec(msg);
      if (!m) continue;
      const [, method, rawPath, status, ms] = m as unknown as [string, string, string, string, string];
      const key      = normaliseRoute(method, rawPath);
      const duration = Number(ms);
      const samples  = buckets.get(key) ?? [];
      samples.push(duration);
      buckets.set(key, samples);
      totals.set(key, (totals.get(key) ?? 0) + 1);
      if (Number(status) >= 500) errCounts.set(key, (errCounts.get(key) ?? 0) + 1);
    }

    const metrics = Array.from(buckets.entries()).map(([key, samples]) => {
      const sorted = [...samples].sort((a, b) => a - b);
      const count  = totals.get(key) ?? samples.length;
      const avg    = samples.reduce((a, b) => a + b, 0) / samples.length;
      const p = (pct: number) => sorted[Math.floor(sorted.length * pct)] ?? 0;
      const spaceIdx = key.indexOf(" ");
      const method   = key.slice(0, spaceIdx);
      const path     = key.slice(spaceIdx + 1);
      return {
        key, method, path,
        count,
        avgMs:       Math.round(avg),
        p50Ms:       p(0.5),
        p95Ms:       p(0.95),
        minMs:       sorted[0] ?? 0,
        maxMs:       sorted[sorted.length - 1] ?? 0,
        successRate: Math.round((1 - (errCounts.get(key) ?? 0) / count) * 100),
        pages:       pagesFor(key),
      };
    }).sort((a, b) => b.avgMs - a.avgMs);

    return res.json({ available: true, metrics, window: win, linesScanned: entries.length, generatedAt: new Date().toISOString() });
  });
}

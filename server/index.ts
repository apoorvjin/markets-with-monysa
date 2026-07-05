import express from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { registerRoutes } from "./routes";
import { parseChartRenderer } from "./lib/chart-renderer";
import { startLeaderElection, machineId } from "./lib/leader";

const app = express();
const log = console.log;

// Behind Fly.io's edge proxy, every request arrives with X-Forwarded-For but a
// shared upstream IP. Trust 1 hop so express-rate-limit keys per real client IP
// instead of grouping everyone behind the proxy. Without this, the rate limiter
// emits ValidationError noise and groups all users under one IP.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  // FLY_REGION is auto-injected by Fly.io only when running on an actual Fly machine —
  // unlike FLY_APP_NAME which can be set locally. Use it as the reliable prod signal.
  const isProd = !!process.env.FLY_REGION || process.env.NODE_ENV === "production";

  app.use((req, res, next) => {
    const allowedOrigins = new Set<string>(
      (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
    );

    const origin = req.header("origin");

    // Allow localhost + common tunnel origins in local dev — never in production.
    const isLocaldev =
      !isProd &&
      (origin?.startsWith("http://localhost:") ||
        origin?.startsWith("http://127.0.0.1:") ||
        origin?.includes(".ngrok.io") ||
        origin?.includes(".ngrok-free.app") ||
        origin?.includes(".ngrok.app"));

    const isAllowed = origin && (allowedOrigins.has(origin) || isLocaldev);

    if (isAllowed) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, HEAD",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent, X-Device-ID, X-Signature, If-None-Match",
      );
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Expose-Headers", "Content-Type, X-Total-Count, X-Page-Count");
      res.header("Access-Control-Max-Age", "86400");
    }

    if (req.method === "OPTIONS") {
      if (isAllowed) {
        log(`✓ CORS: Allowed OPTIONS from ${origin}`);
        return res.sendStatus(200);
      } else {
        log(`✗ CORS: Rejected OPTIONS from ${origin} (not in allowed origins)`);
        return res.status(403).end();
      }
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `[TIMING] ${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function setupRateLimiting(app: express.Application) {
  // General limiter — all /api/* routes
  const generalLimiter = rateLimit({
    windowMs: 60_000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  // Tighter limit for compute-heavy signal generation
  const signalsLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Signal request rate limit exceeded. Please slow down." },
  });

  // Strictest limit for GPT-4o-mini AI briefing (expensive call)
  const briefingLimiter = rateLimit({
    windowMs: 60_000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI briefing rate limit exceeded (5 requests/min)." },
  });

  app.use("/api", generalLimiter);
  app.use("/api/trading/signals", signalsLimiter);
  app.use("/api/volatility/briefing", briefingLimiter);
}

// Routes protected by HMAC signing — the expensive / AI-backed endpoints.
const SIGNED_ROUTES = [
  "/api/trading/signals",
  "/api/trading/backtest",
  "/api/volatility/briefing",
];

function setupRequestSigning(app: express.Application) {
  const secret = process.env.APP_SIGNING_SECRET;

  if (!secret) {
    log("⚠️  APP_SIGNING_SECRET not set — request signing disabled (dev mode only)");
    return;
  }

  const signingMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers["x-signature"] as string | undefined;
    if (!header) {
      return res.status(401).json({ error: "Missing X-Signature header." });
    }

    const dotIdx = header.indexOf(".");
    if (dotIdx === -1) {
      return res.status(401).json({ error: "Malformed X-Signature header." });
    }

    const ts = header.slice(0, dotIdx);
    const provided = header.slice(dotIdx + 1);
    const tsNum = parseInt(ts, 10);

    // Replay protection: reject timestamps older than 5 minutes.
    if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60_000) {
      return res.status(401).json({ error: "Request timestamp expired." });
    }

    const expected = createHmac("sha256", secret).update(ts).digest("hex");

    try {
      const expectedBuf = Buffer.from(expected, "hex");
      const providedBuf = Buffer.from(provided, "hex");
      if (
        expectedBuf.length !== providedBuf.length ||
        !timingSafeEqual(expectedBuf, providedBuf)
      ) {
        return res.status(401).json({ error: "Invalid request signature." });
      }
    } catch {
      return res.status(401).json({ error: "Invalid request signature." });
    }

    next();
  };

  for (const path of SIGNED_ROUTES) {
    app.use(path, signingMiddleware);
  }
  log(`✓ Request signing active on: ${SIGNED_ROUTES.join(", ")}`);
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  // OGE worker mode: spawned by triggerPipeline() as an ephemeral 512 MB Fly.io machine.
  // Runs the PDF pipeline, writes to Redis, then exits — no HTTP server started.
  if (process.env.OGE_WORKER_MODE === "1") {
    const { runOgePipelineAndExit } = await import("./routes/oge");
    return runOgePipelineAndExit();
  }

  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  setupRateLimiting(app);
  setupRequestSigning(app);
  app.use(parseChartRenderer);

  app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", name: "Markets API", version: "1.0.0" });
  });

  app.get("/support", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monysa — Support</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:48px auto;padding:0 24px;color:#1a1a1a;line-height:1.6}
  h1{font-size:28px;font-weight:700;margin-bottom:4px}
  h2{font-size:18px;font-weight:600;margin-top:36px}
  p,li{font-size:16px;color:#333}
  a{color:#00C49A}
  hr{border:none;border-top:1px solid #e5e5e5;margin:32px 0}
  .tag{font-size:12px;color:#888;margin-top:0}
</style>
</head>
<body>
<h1>Monysa</h1>
<p class="tag">Support &amp; Help</p>
<hr>
<h2>Contact Us</h2>
<p>For questions, issues, or feedback email us at:<br>
<a href="mailto:apurva.ggps@gmail.com">apurva.ggps@gmail.com</a></p>
<p>We aim to respond within 1–2 business days.</p>
<hr>
<h2>Frequently Asked Questions</h2>
<h2 style="font-size:16px;font-weight:600">How do I upgrade to Pro?</h2>
<p>Tap the Profile tab → Subscription → choose your plan. Subscriptions are managed through the App Store.</p>
<h2 style="font-size:16px;font-weight:600">How do I restore my subscription after reinstalling?</h2>
<p>Tap Profile → Subscription → Restore Purchases.</p>
<h2 style="font-size:16px;font-weight:600">Why are prices or signals not loading?</h2>
<p>Pull down to refresh. If the issue persists, check your internet connection and try again in a few minutes. Market data depends on third-party providers and may occasionally be unavailable during off-hours.</p>
<h2 style="font-size:16px;font-weight:600">What do the trading signals mean?</h2>
<p>BUY, HOLD, and SELL signals are generated by AI models analysing price action and market structure. They are informational only and do not constitute financial advice. Always do your own research.</p>
<h2 style="font-size:16px;font-weight:600">Is Monysa available on Android?</h2>
<p>iOS only at this time.</p>
<h2 style="font-size:16px;font-weight:600">How do I cancel my subscription?</h2>
<p>Open the Settings app on your iPhone → Apple ID → Subscriptions → Monysa → Cancel.</p>
<hr>
<p style="font-size:13px;color:#888">© 2026 Monysa. All content is for informational purposes only and does not constitute investment advice.</p>
</body>
</html>`);
  });

  app.get("/privacy", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monysa — Privacy Policy</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:48px auto;padding:0 24px;color:#1a1a1a;line-height:1.6}
  h1{font-size:28px;font-weight:700;margin-bottom:4px}
  h2{font-size:18px;font-weight:600;margin-top:36px}
  p,li{font-size:16px;color:#333}
  a{color:#00C49A}
  hr{border:none;border-top:1px solid #e5e5e5;margin:32px 0}
  .tag{font-size:12px;color:#888;margin-top:0}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{text-align:left;padding:10px 12px;border:1px solid #e5e5e5;font-size:14px}
  th{background:#f7f7f7;font-weight:600}
</style>
</head>
<body>
<h1>Monysa</h1>
<p class="tag">Privacy Policy &mdash; Effective June 28, 2026</p>
<hr>
<p>Monysa ("we", "our", or "us") is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights.</p>

<h2>1. Information We Collect</h2>
<p><strong>Device Identifier.</strong> We generate a random device ID when you first open the app. It is stored locally on your device and sent with API requests to manage your subscription plan. It is not linked to your name, email, or Apple ID.</p>
<p><strong>Subscription &amp; Purchase Data.</strong> If you subscribe to a paid plan, your purchase is processed by Apple and managed through RevenueCat. We receive confirmation of your subscription status linked to your device ID. We do not receive your payment card details.</p>
<p><strong>Crash Reports.</strong> If the app crashes, an anonymised crash report is sent to Sentry to help us fix bugs. Reports include device type, OS version, and a stack trace. They are not linked to your identity.</p>
<p><strong>Push Notifications.</strong> If you enable push notifications, your device token is registered with Firebase Cloud Messaging. We use this only to send price alerts and market updates you have opted into. You can disable notifications at any time in iPhone Settings.</p>

<h2>2. Information We Do Not Collect</h2>
<ul>
<li>We do not require account creation or collect your name or email address.</li>
<li>We do not collect your location.</li>
<li>We do not track you across other apps or websites.</li>
<li>We do not sell your data to third parties.</li>
<li>We do not collect the financial data you view — market prices, signals, and trading data are displayed to you, not collected from you.</li>
</ul>

<h2>3. How We Use Your Information</h2>
<table>
<tr><th>Data</th><th>Purpose</th></tr>
<tr><td>Device ID</td><td>Enforce subscription plan; deliver plan-appropriate content</td></tr>
<tr><td>Subscription status</td><td>Unlock paid features; restore purchases</td></tr>
<tr><td>Crash reports</td><td>Fix bugs and improve app stability</td></tr>
<tr><td>Push notification token</td><td>Deliver price alerts you requested</td></tr>
</table>

<h2>4. Third-Party Services</h2>
<ul>
<li><strong>RevenueCat</strong> — subscription management (<a href="https://www.revenuecat.com/privacy">revenuecat.com/privacy</a>)</li>
<li><strong>Firebase / Google</strong> — push notifications (<a href="https://policies.google.com/privacy">policies.google.com/privacy</a>)</li>
<li><strong>Sentry</strong> — crash reporting (<a href="https://sentry.io/privacy/">sentry.io/privacy</a>)</li>
<li><strong>Yahoo Finance</strong> — market data</li>
<li><strong>Financial Modeling Prep</strong> — congressional trading data</li>
</ul>

<h2>5. Data Retention</h2>
<ul>
<li>Device ID: retained until you delete the app.</li>
<li>Subscription records: retained by RevenueCat per their policy.</li>
<li>Crash reports: retained by Sentry for 90 days.</li>
<li>Push tokens: removed when you disable notifications or delete the app.</li>
</ul>

<h2>6. Children's Privacy</h2>
<p>Monysa is not directed at children under 13. We do not knowingly collect data from children.</p>

<h2>7. Your Rights</h2>
<p>Because we do not collect personally identifiable information, most requests can be fulfilled by deleting the app (which removes your device ID). For any privacy request contact us at <a href="mailto:apurva.ggps@gmail.com">apurva.ggps@gmail.com</a>.</p>

<h2>8. Changes to This Policy</h2>
<p>We may update this policy from time to time. The effective date at the top of this page will reflect any changes. Continued use of the app constitutes acceptance.</p>

<h2>9. Contact</h2>
<p>Monysa<br><a href="mailto:apurva.ggps@gmail.com">apurva.ggps@gmail.com</a></p>
<hr>
<p style="font-size:13px;color:#888">© 2026 Monysa.</p>
</body>
</html>`);
  });

  // Seed in-process plan cache from Firestore so plans survive server restarts.
  const { loadPlansFromFirestore } = await import("./plan-enforcement");
  await loadPlansFromFirestore();

  const { registerAdminRoutes } = await import("./routes/admin");
  registerAdminRoutes(app);

  const server = await registerRoutes(app);

  // Serve the compiled admin frontend at /admin/* when dist is present.
  // Must register before the web SPA catch-all below.
  const adminDist = join(process.cwd(), "frontend/apps/admin/dist");
  if (existsSync(adminDist)) {
    app.use("/admin", express.static(adminDist));
    app.get(/^\/admin(\/.*)?$/, (_req: Request, res: Response) => {
      res.sendFile(join(adminDist, "index.html"));
    });
    log(`✓ Serving admin frontend from ${adminDist}`);
  }

  // Serve the compiled web frontend when dist/ is present.
  // API routes above always take priority. The SPA catch-all must come last.
  // Build with: pnpm --filter @monysa/web build (VITE_API_BASE_URL empty → same-origin)
  const webDist = join(process.cwd(), "frontend/apps/web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/.*/, (_req: Request, res: Response) => {
      res.sendFile(join(webDist, "index.html"));
    });
    log(`✓ Serving web frontend from ${webDist}`);
  }

  setupErrorHandler(app);

  // Start leader election before listening so background jobs can check
  // isLeader() as soon as they fire. Safe to call when Redis is absent
  // (becomes a no-op and isLeader() returns true).
  startLeaderElection();

  // Start price-alert checker (leader-only; requires Firestore + FCM via firebase-admin).
  const { startAlertChecker } = await import("./lib/alert-checker");
  startAlertChecker();

  // Start VIX term-structure regime-change notifier (leader-only; sends FCM topic push).
  const { startRegimeChangeNotifier } = await import("./lib/regime-change-notifier");
  startRegimeChangeNotifier();

  const port = parseInt(process.env.PORT || "5001", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port} (machine ${machineId()})`);
    },
  );
})();

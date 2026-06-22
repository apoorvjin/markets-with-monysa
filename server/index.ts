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
  // FLY_APP_NAME is injected by Fly.io at runtime — reliable prod signal.
  // In production the Flutter app (Dart HTTP, no Origin header) is the only
  // legitimate browser-less client, so we must not grant CORS to arbitrary
  // localhost origins that any browser script can forge.
  const isProd = !!process.env.FLY_APP_NAME || process.env.NODE_ENV === "production";

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

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
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

  // Seed in-process plan cache from Firestore so plans survive server restarts.
  const { loadPlansFromFirestore } = await import("./plan-enforcement");
  await loadPlansFromFirestore();

  const { registerAdminRoutes } = await import("./routes/admin");
  registerAdminRoutes(app);

  const server = await registerRoutes(app);

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

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const allowedOrigins = new Set<string>(
      (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
    );

    const origin = req.header("origin");

    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    const isAllowed = origin && (allowedOrigins.has(origin) || isLocalhost);

    if (isAllowed) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS, HEAD",
      );
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent",
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
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", name: "Markets API", version: "1.0.0" });
  });

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5001", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();

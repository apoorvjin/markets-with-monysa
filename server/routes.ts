import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { createTradingRouter, getHealthStatus } from "./trading";
import { registerMarketsRoutes } from "./routes/markets";
import { registerVolatilityRoutes } from "./routes/volatility";
import { registerEconomyRoutes } from "./routes/economy";
import { registerExposureRoutes } from "./routes/exposure";
import { registerHeatmapRoutes } from "./routes/heatmap";
import { registerBillingRoutes } from "./routes/billing";
import { getAvailableProviders } from "./providers";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json(getHealthStatus());
  });

  app.get("/api/providers", (_req, res) => {
    res.json({ available: getAvailableProviders(), default: "yahoo" });
  });

  registerMarketsRoutes(app);
  registerVolatilityRoutes(app);
  registerEconomyRoutes(app);
  registerExposureRoutes(app);
  registerHeatmapRoutes(app);
  registerBillingRoutes(app);

  app.use("/api/trading", createTradingRouter());

  const httpServer = createServer(app);
  return httpServer;
}

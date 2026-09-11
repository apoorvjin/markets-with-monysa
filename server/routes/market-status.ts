import type { Express } from "express";
import { fetchYahooQuoteSummaryBatch } from "./heatmap";

// Global exchange-session status — whether each of 8 major exchanges is
// currently in its live REGULAR cash session, sourced from a real Yahoo
// quote per exchange rather than day-of-week + local-time math. This is
// what makes it holiday-aware "for free": on a market holiday Yahoo reports
// CLOSED/PREPRE/POSTPOST for that exchange's listings all day, same as it
// does for any other closure — no holiday calendar to hand-maintain.
//
// One liquid, reliably-quoted EQUITY per exchange, never the index itself —
// mirrors heatmap.ts's own constituent-majority-vote pattern for exactly the
// same reason: Yahoo does not reliably report `marketState` on bare index
// tickers (^GSPC, ^FTSE, etc.), only on real listings. Verified live via
// fetchYahooQuoteSummaryBatch (2026-09) — all 8 resolved a marketState,
// including Shanghai/Tokyo which were unverified going in.
const EXCHANGES: { city: string; symbol: string }[] = [
  { city: "New York", symbol: "AAPL" },
  { city: "London", symbol: "BP.L" },
  { city: "Frankfurt", symbol: "SAP.DE" },
  { city: "Mumbai", symbol: "RELIANCE.NS" },
  { city: "Hong Kong", symbol: "0700.HK" },
  { city: "Shanghai", symbol: "600519.SS" },
  { city: "Tokyo", symbol: "7203.T" },
  { city: "Sydney", symbol: "BHP.AX" },
];

// Session state changes at most a handful of times a day (open/close/holiday
// boundaries) — a long TTL keeps this to one shared Yahoo batch call for
// every device on the app, on top of the already-shared crumb/cookie client
// heatmap.ts's quoteSummary path uses everywhere else.
const TTL_MS = 10 * 60 * 1000;
type SessionCache = { exchanges: { city: string; open: boolean }[]; lastUpdated: string; ts: number };
let cache: SessionCache | null = null;
let inFlight: Promise<SessionCache> | null = null;

async function getStatuses() {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const quotes = await fetchYahooQuoteSummaryBatch(EXCHANGES.map((e) => e.symbol));
    const exchanges = EXCHANGES.map((e) => ({
      city: e.city,
      open: quotes.get(e.symbol)?.marketState === "REGULAR",
    }));
    cache = { exchanges, lastUpdated: new Date().toISOString(), ts: Date.now() };
    return cache;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function registerMarketStatusRoutes(app: Express): void {
  app.get("/api/markets/session-status", async (_req, res) => {
    try {
      const data = await getStatuses();
      if (!data) return res.status(502).json({ error: "Failed to load session status" });
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      res.json({ exchanges: data.exchanges, lastUpdated: data.lastUpdated });
    } catch (e) {
      console.error("[market-status] session-status failed:", e);
      res.status(500).json({ error: "Failed to load session status" });
    }
  });
}

import type { Express, Response } from "express";

/**
 * Nasdaq — thin proxy over the unofficial (keyless) api/www.nasdaq.com JSON
 * endpoints. Same risk class as the earnings-calendar Nasdaq call in trading.ts:
 * undocumented, browser-header-gated, no SLA. So every handler caches hard and
 * degrades to an empty payload on failure — a screen must never break or block
 * on this source (mirrors the "return null/[] on failure, never fabricate"
 * precedent in Known Pitfalls).
 *
 * Note the host: the news topics live on www.nasdaq.com; api.nasdaq.com 301s to
 * it. We target www directly to skip the redirect round-trip.
 */

// Browser-ish headers — Nasdaq 403s a bare UA (see fetchNasdaqEarnings).
const NASDAQ_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
} as const;

const PR_CACHE_TTL = 15 * 60 * 1000; // 15 min — company PRs don't post faster than this matters
const prCache = new Map<string, { data: PressRelease[]; ts: number }>();

interface PressRelease {
  title: string;
  url: string;
  publisher: string;
  /** Coarse date string as Nasdaq gives it, e.g. "Aug 4, 2026". */
  created: string;
  ago: string;
  description: string;
}

function setCacheHeaders(res: Response, ttlMs: number): void {
  const maxAge = Math.floor(ttlMs / 2000);
  const swr = Math.floor(ttlMs / 1000);
  // Public company PRs — safe for a shared CDN edge cache.
  res.set("Cache-Control", `public, max-age=${maxAge}, stale-while-revalidate=${swr}`);
}

async function nasdaqJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Nasdaq ${r.status}`);
  return (await r.json()) as T;
}

/** Nasdaq returns site-relative paths ("/market-activity/…") — make absolute. */
function absoluteUrl(u: string | undefined): string {
  if (!u) return "";
  return u.startsWith("http") ? u : `https://www.nasdaq.com${u}`;
}

async function fetchPressReleases(symbol: string): Promise<PressRelease[]> {
  const url = `https://www.nasdaq.com/api/news/topic/press_release?q=symbol:${encodeURIComponent(
    symbol,
  )}&limit=12&offset=0`;
  const r = await fetch(url, { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Nasdaq PR ${r.status}`);
  const json = (await r.json()) as {
    data?: {
      rows?: Array<{
        title?: string;
        url?: string;
        publisher?: string;
        created?: string;
        ago?: string;
        description?: string;
      }> | null;
    };
  };
  const rows = json?.data?.rows ?? [];
  return rows
    .filter((row) => row.title && row.url)
    .map((row) => ({
      title: (row.title ?? "").trim(),
      // Nasdaq returns a site-relative path — make it absolute.
      url: row.url!.startsWith("http") ? row.url! : `https://www.nasdaq.com${row.url}`,
      publisher: (row.publisher ?? "").trim(),
      created: (row.created ?? "").trim(),
      ago: (row.ago ?? "").trim(),
      description: (row.description ?? "").trim().slice(0, 400),
    }));
}

// ── Insider trades ──────────────────────────────────────────────────────────
const INSIDER_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h — Form 4s trickle in daily
const insiderCache = new Map<string, { data: InsiderResult; ts: number }>();

interface InsiderTrade {
  insider: string;
  relation: string;
  date: string;
  type: string;
  ownType: string;
  shares: string;
  price: string;
  sharesHeld: string;
  url: string;
}
interface InsiderResult {
  numberOfTrades: string;
  numberOfSharesTraded: string;
  trades: InsiderTrade[];
}

async function fetchInsiderTrades(symbol: string): Promise<InsiderResult> {
  const url = `https://api.nasdaq.com/api/company/${encodeURIComponent(
    symbol,
  )}/insider-trades?limit=15&type=ALL&sortColumn=lastDate&sortOrder=DESC`;
  const json = await nasdaqJson<{
    data?: {
      numberOfTrades?: { value?: string } | string;
      numberOfSharesTraded?: { value?: string } | string;
      transactionTable?: { table?: { rows?: Array<Record<string, string>> | null } };
    };
  }>(url);
  const d = json?.data ?? {};
  const scalar = (v: { value?: string } | string | undefined): string =>
    typeof v === "object" ? (v?.value ?? "") : (v ?? "");
  const rows = d.transactionTable?.table?.rows ?? [];
  return {
    numberOfTrades: scalar(d.numberOfTrades),
    numberOfSharesTraded: scalar(d.numberOfSharesTraded),
    trades: rows.map((r) => ({
      insider: r.insider ?? "",
      relation: r.relation ?? "",
      date: r.lastDate ?? "",
      type: r.transactionType ?? "",
      ownType: r.ownType ?? "",
      shares: r.sharesTraded ?? "",
      price: r.lastPrice ?? "",
      sharesHeld: r.sharesHeld ?? "",
      url: absoluteUrl(r.url),
    })),
  };
}

// ── Institutional holdings (13F) ────────────────────────────────────────────
const INST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — 13F data is quarterly
const instCache = new Map<string, { data: InstResult; ts: number }>();

interface InstHolder {
  owner: string;
  date: string;
  sharesHeld: string;
  sharesChange: string;
  sharesChangePct: string;
  marketValue: string;
  url: string;
}
interface InstResult {
  sharesOutstandingPct: string;
  totalHoldingsValue: string;
  holders: InstHolder[];
}

async function fetchInstitutionalHoldings(symbol: string): Promise<InstResult> {
  const url = `https://api.nasdaq.com/api/company/${encodeURIComponent(
    symbol,
  )}/institutional-holdings?limit=15&type=TOTAL&sortColumn=marketValue&sortOrder=DESC`;
  const json = await nasdaqJson<{
    data?: {
      ownershipSummary?: Record<string, { value?: string } | string>;
      holdingsTransactions?: { table?: { rows?: Array<Record<string, string>> | null } };
    };
  }>(url);
  const d = json?.data ?? {};
  const sumVal = (k: string): string => {
    const v = d.ownershipSummary?.[k];
    return typeof v === "object" ? (v?.value ?? "") : (v ?? "");
  };
  const rows = d.holdingsTransactions?.table?.rows ?? [];
  return {
    sharesOutstandingPct: sumVal("SharesOutstandingPCT"),
    totalHoldingsValue: sumVal("TotalHoldingsValue"),
    holders: rows.map((r) => ({
      owner: r.ownerName ?? "",
      date: r.date ?? "",
      sharesHeld: r.sharesHeld ?? "",
      sharesChange: r.sharesChange ?? "",
      sharesChangePct: r.sharesChangePCT ?? "",
      marketValue: r.marketValue ?? "",
      url: absoluteUrl(r.url),
    })),
  };
}

// ── Dividend calendar ───────────────────────────────────────────────────────
const DIV_CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
const divCache = new Map<string, { data: DividendRow[]; ts: number }>();

interface DividendRow {
  symbol: string;
  companyName: string;
  exDate: string;
  paymentDate: string;
  recordDate: string;
  rate: string;
  annualDividend: string;
  announcementDate: string;
}

async function fetchDividends(date: string): Promise<DividendRow[]> {
  const url = `https://api.nasdaq.com/api/calendar/dividends?date=${date}`;
  const json = await nasdaqJson<{
    data?: { calendar?: { rows?: Array<Record<string, string>> | null } };
  }>(url);
  const rows = json?.data?.calendar?.rows ?? [];
  return rows.map((r) => ({
    symbol: r.symbol ?? "",
    companyName: r.companyName ?? "",
    exDate: r.dividend_Ex_Date ?? "",
    paymentDate: r.payment_Date ?? "",
    recordDate: r.record_Date ?? "",
    rate: r.dividend_Rate ?? "",
    annualDividend: r.indicated_Annual_Dividend ?? "",
    announcementDate: r.announcement_Date ?? "",
  }));
}

const SYMBOL_RE = /^[A-Z.\-]{1,10}$/;

export function registerNasdaqRoutes(app: Express): void {
  // Per-symbol official company press releases. Free, no plan gate — same as the
  // existing /api/trading/news. Powers the Asset Detail News tab "Company
  // Releases" strip (and the Wire Corporate desk's ticker deep-link target).
  app.get("/api/nasdaq/press-releases/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol || !/^[A-Z.\-]{1,10}$/.test(symbol)) {
      return res.status(400).json({ error: "Invalid symbol" });
    }

    const cached = prCache.get(symbol);
    if (cached && Date.now() - cached.ts < PR_CACHE_TTL) {
      setCacheHeaders(res, PR_CACHE_TTL);
      return res.json({ symbol, items: cached.data, lastUpdated: new Date(cached.ts).toISOString() });
    }

    try {
      const items = await fetchPressReleases(symbol);
      prCache.set(symbol, { data: items, ts: Date.now() });
      setCacheHeaders(res, PR_CACHE_TTL);
      res.json({ symbol, items, lastUpdated: new Date().toISOString() });
    } catch (err) {
      // Degrade gracefully — serve stale if we have it, else empty. Never 500 a
      // News tab over an unofficial source failing.
      console.warn(`[nasdaq] press-releases ${symbol} failed:`, (err as Error).message);
      if (cached) {
        setCacheHeaders(res, PR_CACHE_TTL);
        return res.json({ symbol, items: cached.data, lastUpdated: new Date(cached.ts).toISOString() });
      }
      res.json({ symbol, items: [], lastUpdated: new Date().toISOString() });
    }
  });

  // Per-symbol insider (Form 4) transactions. Free from the server; clients
  // apply the Pro teaser (mirrors the ETF-perf-strip pattern). Powers Asset
  // Detail → Insiders + Investing → Smart $.
  app.get("/api/nasdaq/insider-trades/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol || !SYMBOL_RE.test(symbol)) return res.status(400).json({ error: "Invalid symbol" });

    const cached = insiderCache.get(symbol);
    if (cached && Date.now() - cached.ts < INSIDER_CACHE_TTL) {
      setCacheHeaders(res, INSIDER_CACHE_TTL);
      return res.json({ symbol, ...cached.data, lastUpdated: new Date(cached.ts).toISOString() });
    }
    try {
      const data = await fetchInsiderTrades(symbol);
      insiderCache.set(symbol, { data, ts: Date.now() });
      setCacheHeaders(res, INSIDER_CACHE_TTL);
      res.json({ symbol, ...data, lastUpdated: new Date().toISOString() });
    } catch (err) {
      console.warn(`[nasdaq] insider-trades ${symbol} failed:`, (err as Error).message);
      if (cached) {
        setCacheHeaders(res, INSIDER_CACHE_TTL);
        return res.json({ symbol, ...cached.data, lastUpdated: new Date(cached.ts).toISOString() });
      }
      res.json({ symbol, numberOfTrades: "", numberOfSharesTraded: "", trades: [], lastUpdated: new Date().toISOString() });
    }
  });

  // Per-symbol institutional (13F) holdings. Same free-server / client-teaser model.
  app.get("/api/nasdaq/institutional-holdings/:symbol", async (req, res) => {
    const symbol = String(req.params.symbol || "").trim().toUpperCase();
    if (!symbol || !SYMBOL_RE.test(symbol)) return res.status(400).json({ error: "Invalid symbol" });

    const cached = instCache.get(symbol);
    if (cached && Date.now() - cached.ts < INST_CACHE_TTL) {
      setCacheHeaders(res, INST_CACHE_TTL);
      return res.json({ symbol, ...cached.data, lastUpdated: new Date(cached.ts).toISOString() });
    }
    try {
      const data = await fetchInstitutionalHoldings(symbol);
      instCache.set(symbol, { data, ts: Date.now() });
      setCacheHeaders(res, INST_CACHE_TTL);
      res.json({ symbol, ...data, lastUpdated: new Date().toISOString() });
    } catch (err) {
      console.warn(`[nasdaq] institutional-holdings ${symbol} failed:`, (err as Error).message);
      if (cached) {
        setCacheHeaders(res, INST_CACHE_TTL);
        return res.json({ symbol, ...cached.data, lastUpdated: new Date(cached.ts).toISOString() });
      }
      res.json({ symbol, sharesOutstandingPct: "", totalHoldingsValue: "", holders: [], lastUpdated: new Date().toISOString() });
    }
  });

  // Dividend calendar for a given date (YYYY-MM-DD). Free. Powers Macro → Calendar.
  app.get("/api/nasdaq/dividends", async (req, res) => {
    const date = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date=YYYY-MM-DD required" });

    const cached = divCache.get(date);
    if (cached && Date.now() - cached.ts < DIV_CACHE_TTL) {
      setCacheHeaders(res, DIV_CACHE_TTL);
      return res.json({ date, rows: cached.data, lastUpdated: new Date(cached.ts).toISOString() });
    }
    try {
      const rows = await fetchDividends(date);
      divCache.set(date, { data: rows, ts: Date.now() });
      setCacheHeaders(res, DIV_CACHE_TTL);
      res.json({ date, rows, lastUpdated: new Date().toISOString() });
    } catch (err) {
      console.warn(`[nasdaq] dividends ${date} failed:`, (err as Error).message);
      if (cached) {
        setCacheHeaders(res, DIV_CACHE_TTL);
        return res.json({ date, rows: cached.data, lastUpdated: new Date(cached.ts).toISOString() });
      }
      res.json({ date, rows: [], lastUpdated: new Date().toISOString() });
    }
  });
}

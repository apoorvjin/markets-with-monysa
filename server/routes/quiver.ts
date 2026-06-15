import type { Express } from "express";
import { fetchBatch } from "./shared";

// ── Cache ──────────────────────────────────────────────────────────────────────

const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry { data: unknown; ts: number }
const cache = new Map<string, CacheEntry>();

function getCached<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL) return null;
  return e.data as T;
}
function setCached(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ── Amount-range → midpoint (STOCK Act disclosure ranges) ─────────────────────

const AMOUNT_MAP: Record<string, number> = {
  "$1,001 - $15,000": 8_000,
  "$15,001 - $50,000": 32_500,
  "$50,001 - $100,000": 75_000,
  "$100,001 - $250,000": 175_000,
  "$250,001 - $500,000": 375_000,
  "$500,001 - $1,000,000": 750_000,
  "$1,000,001 - $5,000,000": 3_000_000,
  "Over $5,000,000": 7_500_000,
};

/** Normalise FMP/Quiver amount strings before map lookup (handles varied separators). */
function parseMidpoint(raw: string): number {
  if (!raw) return 8_000;
  // Try direct match first
  if (AMOUNT_MAP[raw] !== undefined) return AMOUNT_MAP[raw];
  // Normalise: em-dash, en-dash, "to", multiple spaces → " - "
  const norm = raw.replace(/\s*[–—to]+\s*/g, " - ").replace(/\s+/g, " ").trim();
  return AMOUNT_MAP[norm] ?? 8_000;
}

// ── Company name → ticker (lobbying + insider name mapping) ───────────────────

const TICKER_MAP: Record<string, string> = {
  AMAZON: "AMZN", META: "META", ALPHABET: "GOOGL", GOOGLE: "GOOGL",
  MICROSOFT: "MSFT", APPLE: "AAPL", COMCAST: "CMCSA",
  "AT&T": "T", ATT: "T", VERIZON: "VZ",
  "LOCKHEED MARTIN": "LMT", LOCKHEED: "LMT",
  BOEING: "BA", RAYTHEON: "RTX",
  "NORTHROP GRUMMAN": "NOC", NORTHROP: "NOC",
  "GENERAL DYNAMICS": "GD",
  PFIZER: "PFE", UNITEDHEALTH: "UNH",
  JPMORGAN: "JPM", "J.P. MORGAN": "JPM",
  EXXON: "XOM", CHEVRON: "CVX",
  WALMART: "WMT", NVIDIA: "NVDA",
  INTEL: "INTC", BROADCOM: "AVGO",
  PALANTIR: "PLTR", TESLA: "TSLA",
  SALESFORCE: "CRM", UBER: "UBER",
  "ADVANCED MICRO": "AMD", AMD: "AMD",
};

function mapNameToTicker(name: string): string | null {
  const upper = name.toUpperCase();
  for (const [key, ticker] of Object.entries(TICKER_MAP)) {
    if (upper.includes(key)) return ticker;
  }
  return null;
}

// ── Known company names (for snapshot data) ───────────────────────────────────

export const KNOWN_NAMES: Record<string, string> = {
  NVDA: "NVIDIA Corp", TSM: "Taiwan Semiconductor", META: "Meta Platforms",
  AMZN: "Amazon.com", MSFT: "Microsoft Corp", IBIT: "iShares Bitcoin ETF",
  MU: "Micron Technology", AAPL: "Apple Inc", AVGO: "Broadcom Inc",
  GOOGL: "Alphabet Inc", PLTR: "Palantir Technologies", TSLA: "Tesla Inc",
  AMD: "Advanced Micro Devices", CRM: "Salesforce Inc", UBER: "Uber Technologies",
  CMCSA: "Comcast Corp", T: "AT&T Inc", NOC: "Northrop Grumman",
  LMT: "Lockheed Martin", BA: "Boeing Co", UNH: "UnitedHealth Group",
  PFE: "Pfizer Inc", RTX: "RTX Corp",
};

// ── Fallback snapshots (curated real-world data, refreshed periodically) ──────

const CONGRESS_SNAPSHOT: Array<{ ticker: string; amount: number }> = [
  { ticker: "NVDA",  amount: 3_375_000 },
  { ticker: "TSM",   amount: 1_297_000 },
  { ticker: "META",  amount: 1_289_000 },
  { ticker: "AMZN",  amount:   900_000 },
  { ticker: "MSFT",  amount:   750_000 },
  { ticker: "IBIT",  amount:   270_000 },
  { ticker: "MU",    amount:   175_000 },
  { ticker: "AAPL",  amount:   175_000 },
  { ticker: "AVGO",  amount:   175_000 },
  { ticker: "GOOGL", amount:   175_000 },
];


// ── Shared response item type ─────────────────────────────────────────────────

interface QuiverItem {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  weight: number;
  rank: number;
  badge: string;
  badgeLabel: string;
}

// ── Congress trade type (raw individual trades) ────────────────────────────────

interface CongressTrade {
  memberName: string;
  chamber: "Senate" | "House";
  ticker: string;
  name?: string;
  assetDescription: string;
  type: "buy" | "sell";
  transactionDate: string;
  filingDate: string;
  amount: string;
  amountMidpoint?: number;
  party?: string;
  state?: string;
}

// ── Price enrichment ──────────────────────────────────────────────────────────

async function enrichWithPrices(
  ranked: Array<{ symbol: string; name: string; badge: string; badgeLabel: string; weight: number }>,
): Promise<QuiverItem[]> {
  const symbols = ranked.map(r => r.symbol);
  const prices = await fetchBatch(symbols);

  return ranked.map((r, i) => {
    const p = prices.get(r.symbol);
    return {
      symbol:       r.symbol,
      name:         r.name,
      price:        p?.price    ?? null,
      changePercent: p?.changePercent ?? null,
      weight:       r.weight,
      rank:         i + 1,
      badge:        r.badge,
      badgeLabel:   r.badgeLabel,
    };
  });
}

// ── FMP helpers ────────────────────────────────────────────────────────────────

/** Resolve member name from an FMP row (handles various field layouts). */
function fmpMemberName(row: Record<string, string>): string {
  if (row.firstName || row.lastName) {
    return `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  }
  return row.name ?? row.owner ?? row.reportingIndividual ?? "Unknown";
}

/** Is this an FMP purchase row? */
function isFmpPurchase(txType: string): boolean {
  const t = txType.toLowerCase();
  return t.includes("purchase") || t.includes("buy") || t.includes("exchange");
}

/**
 * Fetch one FMP endpoint page.
 * Returns null when the endpoint is deprecated/blocked/paywalled (empty or error body).
 * Throws on network errors.
 */
async function fmpPage(
  endpoint: string, page: number, key: string,
): Promise<Array<Record<string, string>> | null> {
  // Try the new stable API first, fall back to legacy v4 path.
  for (const base of [
    `https://financialmodelingprep.com/stable/${endpoint}`,
    `https://financialmodelingprep.com/api/v4/${endpoint}`,
  ]) {
    const url = `${base}?page=${page}&apikey=${key}`;
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      console.warn(`[quiver/fmp] ${base} page=${page} HTTP ${resp.status}`);
      continue;
    }

    const body = await resp.json();

    // FMP deprecated-endpoint response: { "Error Message": "Legacy Endpoint..." }
    if (!Array.isArray(body)) {
      const msg = (body as Record<string, string>)?.["Error Message"] ?? "";
      if (msg) console.warn(`[quiver/fmp] ${base}: ${msg.slice(0, 80)}`);
      // Stable endpoint returned a non-array — no data on this tier, stop trying
      if (base.includes("/stable/")) return null;
      continue;
    }

    // Empty array — stable endpoint has no data (paywalled or genuinely empty)
    if (body.length === 0) {
      if (base.includes("/stable/")) return null;
      continue;
    }

    return body as Array<Record<string, string>>;
  }
  return null;
}

// ── STRATEGY 1: Congress Buys (FMP — primary) ─────────────────────────────────

/**
 * Fetches the last 365 days of Senate + House purchase transactions from FMP
 * (tries stable API first, then legacy v4) and returns the top-10 tickers by
 * aggregate disclosed dollar amount.
 */
async function fetchCongressFMP(): Promise<Array<{ ticker: string; amount: number }>> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY not set");

  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const allRows: Array<Record<string, string>> = [];

  for (const endpoint of ["senate-trading", "house-trading"]) {
    for (let page = 0; page < 10; page++) {
      const rows = await fmpPage(endpoint, page, key);
      if (!rows) break; // null = paywalled/deprecated, no point continuing

      allRows.push(...rows);

      const oldestDate = rows[rows.length - 1]?.transactionDate ?? "";
      if (oldestDate && oldestDate < cutoff) break;

      await new Promise(r => setTimeout(r, 250));
    }
  }

  if (allRows.length < 5) throw new Error(`FMP returned only ${allRows.length} rows — data may require a paid plan`);

  const agg = new Map<string, number>();
  for (const row of allRows) {
    const txDate = row.transactionDate ?? "";
    if (!txDate || txDate < cutoff) continue;
    if (!isFmpPurchase(row.transactionType ?? "")) continue;
    const ticker = (row.ticker ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "").trim();
    if (!ticker || ticker.length > 6) continue;
    agg.set(ticker, (agg.get(ticker) ?? 0) + parseMidpoint(row.amount ?? ""));
  }

  if (agg.size < 3) throw new Error("Too few distinct tickers from FMP");

  return Array.from(agg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ticker, amount]) => ({ ticker, amount }));
}

// ── STRATEGY 1: Congress Buys (Quiver — free public endpoint, no key required) ──

async function fetchQuiverRows(): Promise<Array<Record<string, string>>> {
  const key = process.env.QUIVER_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "monysa-app/1.0" };
  if (key) headers["Authorization"] = `Token ${key}`;

  const resp = await fetch("https://api.quiverquant.com/beta/live/congresstrading", {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`Quiver ${resp.status}`);

  const rows = await resp.json() as Array<Record<string, string>>;
  if (!Array.isArray(rows) || rows.length < 10) throw new Error("Quiver returned insufficient data");
  return rows;
}

async function fetchCongressQuiver(): Promise<Array<{ ticker: string; amount: number }>> {
  const rows = await fetchQuiverRows();

  const agg = new Map<string, number>();
  for (const row of rows) {
    const tx = (row.Transaction ?? "").toUpperCase();
    if (!tx.includes("PURCHASE") && !tx.includes("BUY") && !tx.includes("EXCHANGE")) continue;
    const ticker = (row.Ticker ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "").trim();
    if (!ticker || ticker.length > 6) continue;
    agg.set(ticker, (agg.get(ticker) ?? 0) + parseMidpoint(row.Range ?? ""));
  }

  if (agg.size < 3) throw new Error("Too few tickers from Quiver");

  return Array.from(agg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ticker, amount]) => ({ ticker, amount }));
}

// ── Raw trades from Quiver (used by congress-trades endpoint) ─────────────────

async function fetchRawCongressTradesQuiver(): Promise<CongressTrade[]> {
  const rows = await fetchQuiverRows();
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

  const trades: CongressTrade[] = [];
  for (const row of rows) {
    const txDate = row.TransactionDate ?? "";
    if (!txDate || txDate < cutoff) continue;

    const ticker = (row.Ticker ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "").trim();
    if (!ticker || ticker.length > 6) continue;

    const chamber = row.House === "Senate" ? "Senate" : "House";
    const tx = (row.Transaction ?? "").toLowerCase();
    const amtStr = row.Range ?? "";
    if (parseMidpoint(amtStr) <= 32_500) continue; // exclude $1K–$50K ranges
    trades.push({
      memberName:       row.Representative ?? "Unknown",
      chamber,
      ticker,
      name:             KNOWN_NAMES[ticker] || undefined,
      assetDescription: row.Description ?? "",
      type:             tx.includes("purchase") || tx.includes("buy") || tx.includes("exchange") ? "buy" : "sell",
      transactionDate:  txDate,
      filingDate:       row.ReportDate ?? "",
      amount:           amtStr,
      amountMidpoint:   parseMidpoint(amtStr),
      party:            row.Party  || undefined,
      state:            undefined,
    });
  }

  return trades.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

async function getCongressPortfolio(): Promise<QuiverItem[]> {
  const cached = getCached<QuiverItem[]>("congress");
  if (cached) return cached;

  let ranked: Array<{ ticker: string; amount: number }>;
  let source = "snapshot";

  // Cascade: Quiver (free public) → FMP (key required) → snapshot
  const attempts: Array<[string, () => Promise<typeof ranked>]> = [
    ["quiver", fetchCongressQuiver],
    ["fmp",    fetchCongressFMP],
  ];

  for (const [name, fn] of attempts) {
    try {
      ranked = await fn();
      source = name;
      break;
    } catch (e) {
      console.warn(`[quiver/congress] ${name} failed:`, (e as Error).message);
    }
  }
  ranked ??= CONGRESS_SNAPSHOT;

  const total = ranked.reduce((s, r) => s + r.amount, 0);
  const prepared = ranked.map(r => ({
    symbol:     r.ticker,
    name:       KNOWN_NAMES[r.ticker] ?? r.ticker,
    weight:     total > 0 ? r.amount / total : 1 / ranked.length,
    badge:      fmtMoney(r.amount),
    badgeLabel: "disclosed",
  }));

  const items = await enrichWithPrices(prepared);
  console.log(`[quiver/congress] source=${source} items=${items.length}`);
  setCached("congress", items);
  return items;
}

// ── Raw congress trades (last 365 days, FMP-powered) ─────────────────────────

async function fetchRawCongressTrades(): Promise<CongressTrade[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY not set");

  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const trades: CongressTrade[] = [];

  const chambers: Array<[string, "Senate" | "House"]> = [
    ["senate-trading", "Senate"],
    ["house-trading",  "House"],
  ];

  for (const [endpoint, chamber] of chambers) {
    for (let page = 0; page < 15; page++) {
      const rows = await fmpPage(endpoint, page, key);
      if (!rows) break; // null = paywalled/deprecated/empty, stop paging

      let reachedCutoff = false;
      for (const row of rows) {
        const txDate = row.transactionDate ?? "";
        if (!txDate || txDate < cutoff) { reachedCutoff = true; break; }

        const ticker = (row.ticker ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "").trim();
        if (!ticker || ticker.length > 6) continue;

        const txType = row.transactionType ?? "";
        const amtStr = row.amount ?? "";
        if (parseMidpoint(amtStr) <= 32_500) continue; // exclude $1K–$50K ranges
        trades.push({
          memberName:       fmpMemberName(row),
          chamber,
          ticker,
          name:             KNOWN_NAMES[ticker] || undefined,
          assetDescription: row.assetDescription ?? row.asset ?? "",
          type:             isFmpPurchase(txType) ? "buy" : "sell",
          transactionDate:  txDate,
          filingDate:       row.dateRecieved ?? row.filingDate ?? "",
          amount:           amtStr,
          amountMidpoint:   parseMidpoint(amtStr),
          party:            row.party   || undefined,
          state:            row.state   || undefined,
        });
      }

      if (reachedCutoff) break;
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return trades.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

async function getCongressTrades(): Promise<CongressTrade[]> {
  const cached = getCached<CongressTrade[]>("congress-trades");
  if (cached) return cached;

  const sources: Array<[string, () => Promise<CongressTrade[]>]> = [
    ["quiver", fetchRawCongressTradesQuiver],
    ["fmp",    fetchRawCongressTrades],
  ];

  for (const [name, fn] of sources) {
    try {
      const trades = await fn();
      if (trades.length >= 10) {
        console.log(`[quiver/congress-trades] source=${name} count=${trades.length}`);
        setCached("congress-trades", trades);
        return trades;
      }
    } catch (e) {
      console.warn(`[quiver/congress-trades] ${name} failed:`, (e as Error).message);
    }
  }

  console.error("[quiver/congress-trades] all sources failed");
  return [];
}

// ── STRATEGY 2: Lobbying Spending Growth ─────────────────────────────────────

async function fetchLobbyingLive(): Promise<Array<{ ticker: string; thisQ: number; lastQ: number }>> {
  // Senate LDA public API — no key required
  // Iterate last 4 quarters: LD2 is not a valid filing_type; valid types are Q1/Q2/Q3/Q4
  const now = new Date();
  let q = Math.ceil((now.getMonth() + 1) / 3);
  let y = now.getFullYear();

  const allFilings: Array<{ ticker: string; amount: number; period: string }> = [];

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await fetch(
        `https://lda.senate.gov/api/v1/filings/?filing_type=Q${q}&format=json&limit=100&page=1`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (resp.ok) {
        const data = await resp.json() as { results?: Array<Record<string, unknown>> };
        for (const item of data.results ?? []) {
          // Field is `name`, not `client_name`
          const clientName = ((item.client as Record<string, string> | null)?.name ?? "").toUpperCase();
          const ticker = mapNameToTicker(clientName);
          if (!ticker) continue;
          const amount = parseFloat(String(item.income ?? item.expenses ?? "0"));
          if (!amount) continue;
          const period = String(item.filing_period_display ?? `Q${q} ${y}`);
          allFilings.push({ ticker, amount, period });
        }
      }
    } catch { /* continue with next quarter */ }

    q--;
    if (q === 0) { q = 4; y--; }
    await new Promise(r => setTimeout(r, 300));
  }

  if (allFilings.length < 5) throw new Error("Insufficient LDA data");

  // Group by ticker → sort periods → compute QoQ growth
  const byTicker = new Map<string, Array<{ amount: number; period: string }>>();
  for (const f of allFilings) {
    if (!byTicker.has(f.ticker)) byTicker.set(f.ticker, []);
    byTicker.get(f.ticker)!.push({ amount: f.amount, period: f.period });
  }

  const results: Array<{ ticker: string; thisQ: number; lastQ: number }> = [];
  for (const [ticker, filings] of byTicker) {
    const byPeriod = new Map<string, number>();
    for (const f of filings) {
      byPeriod.set(f.period, (byPeriod.get(f.period) ?? 0) + f.amount);
    }
    const periods = Array.from(byPeriod.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (periods.length < 2) continue;
    const lastQ = periods[periods.length - 1][1];
    const prevQ = periods[periods.length - 2][1];
    if (prevQ === 0) continue;
    results.push({ ticker, thisQ: lastQ, lastQ: prevQ });
  }

  return results.sort((a, b) => {
    const ga = (a.thisQ - a.lastQ) / a.lastQ;
    const gb = (b.thisQ - b.lastQ) / b.lastQ;
    return gb - ga;
  }).slice(0, 10);
}

async function getLobbyingPortfolio(): Promise<QuiverItem[]> {
  const cached = getCached<QuiverItem[]>("lobbying");
  if (cached) return cached;

  let ranked: Array<{ ticker: string; thisQ: number; lastQ: number }> = [];
  try {
    ranked = await fetchLobbyingLive();
  } catch (e) {
    console.warn("[quiver/lobbying] live fetch failed:", (e as Error).message);
  }

  const n = ranked.length;
  const prepared = ranked.map(r => {
    const growth = r.lastQ > 0 ? (r.thisQ - r.lastQ) / r.lastQ : 0;
    return {
      symbol:     r.ticker,
      name:       KNOWN_NAMES[r.ticker] ?? r.ticker,
      weight:     1 / n,
      badge:      `+${(growth * 100).toFixed(0)}%`,
      badgeLabel: "QoQ spend",
    };
  });

  const items = await enrichWithPrices(prepared);
  console.log(`[quiver/lobbying] source=live items=${items.length}`);
  setCached("lobbying", items);
  return items;
}

// ── STRATEGY 3: Insider Buys ──────────────────────────────────────────────────

async function fetchInsiderLive(daysBack: number): Promise<Array<{ ticker: string; count: number }>> {
  const startdt = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
  const url = `https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=${startdt}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "monysa-app/1.0 research@monysa.com" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`EDGAR ${resp.status}`);

  const data = await resp.json() as { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } };
  const hits = data.hits?.hits ?? [];
  if (hits.length < 3) throw new Error("Insufficient EDGAR data");

  const counts = new Map<string, number>();
  for (const h of hits) {
    const src = h._source ?? {};
    // display_names format: ["Person Name  (CIK 0001234567)", "COMPANY NAME  (CIK 0001022321)"]
    // ticker/entity_name fields don't exist in EDGAR search-index responses
    const displayNames = Array.isArray(src.display_names) ? (src.display_names as string[]) : [];
    let ticker = "";
    for (const entry of displayNames) {
      const name = entry.split(/\s{2,}\(CIK/)[0].trim();
      const mapped = mapNameToTicker(name.toUpperCase());
      if (mapped) { ticker = mapped; break; }
    }
    if (!ticker || ticker.length > 6) continue;
    counts.set(ticker, (counts.get(ticker) ?? 0) + 1);
  }

  if (counts.size < 3) throw new Error("Could not resolve tickers from EDGAR response");

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ticker, count]) => ({ ticker, count }));
}

// Distinct-insider clusters: tickers where ≥2 different insiders filed Form 4s
// within the lookback window. Used by the institutional-flow scanner in
// server/trading.ts (type=insider). Throws on EDGAR failure — caller handles.
export async function fetchInsiderClusters(
  daysBack: number,
): Promise<Array<{ ticker: string; insiderCount: number; filingCount: number }>> {
  const startdt = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
  const url = `https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=${startdt}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "monysa-app/1.0 research@monysa.com" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`EDGAR ${resp.status}`);

  const data = await resp.json() as { hits?: { hits?: Array<{ _source?: Record<string, unknown> }> } };
  const hits = data.hits?.hits ?? [];
  if (hits.length < 2) throw new Error("Insufficient EDGAR data");

  // Per ticker: set of distinct insider (person) names + total filing count.
  const clusters = new Map<string, { insiders: Set<string>; filings: number }>();
  for (const h of hits) {
    const src = h._source ?? {};
    const displayNames = Array.isArray(src.display_names) ? (src.display_names as string[]) : [];
    let ticker = "";
    let person = "";
    for (const entry of displayNames) {
      const name = entry.split(/\s{2,}\(CIK/)[0].trim();
      const mapped = mapNameToTicker(name.toUpperCase());
      if (mapped && !ticker) ticker = mapped;
      // Entries that don't resolve to a ticker are the individual filer(s).
      else if (!mapped && !person) person = name.toUpperCase();
    }
    if (!ticker || ticker.length > 6 || !person) continue;
    const entry = clusters.get(ticker) ?? { insiders: new Set<string>(), filings: 0 };
    entry.insiders.add(person);
    entry.filings += 1;
    clusters.set(ticker, entry);
  }

  return Array.from(clusters.entries())
    .map(([ticker, v]) => ({ ticker, insiderCount: v.insiders.size, filingCount: v.filings }))
    .filter(c => c.insiderCount >= 2)
    .sort((a, b) => b.insiderCount - a.insiderCount || b.filingCount - a.filingCount);
}

async function getInsiderPortfolio(): Promise<QuiverItem[]> {
  const cached = getCached<QuiverItem[]>("insider");
  if (cached) return cached;

  let ranked: Array<{ ticker: string; count: number }> = [];
  try {
    ranked = await fetchInsiderLive(90);
  } catch (e) {
    console.warn("[quiver/insider] live fetch failed:", (e as Error).message);
  }

  const n = ranked.length;
  const prepared = ranked.map(r => ({
    symbol:     r.ticker,
    name:       KNOWN_NAMES[r.ticker] ?? r.ticker,
    weight:     1 / n,
    badge:      `${r.count} buy${r.count === 1 ? "" : "s"}`,
    badgeLabel: "insiders",
  }));

  const items = await enrichWithPrices(prepared);
  console.log(`[quiver/insider] source=live items=${items.length}`);
  setCached("insider", items);
  return items;
}
// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function reply(
  res: import("express").Response,
  items: QuiverItem[],
  meta: { label: string; rebalance: string },
) {
  res.json({ items, meta, lastUpdated: new Date().toISOString() });
}

// ── House Trades (FMP house-trading, all available history) ──────────────────

interface HouseTradeRow {
  disclosure_year:        number;
  disclosure_date:        string;
  transaction_date:       string;
  owner:                  string;
  ticker:                 string;
  asset_description:      string;
  type:                   string;
  amount:                 string;
  representative:         string;
  district:               string;
  state:                  string;
  ptr_link:               string;
  cap_gains_over_200_usd: boolean;
}

/** Normalise FMP amount strings to the canonical STOCK Act format. */
function normalizeAmountStr(raw: string): string {
  if (!raw) return raw;
  if (AMOUNT_MAP[raw] !== undefined) return raw;
  const norm = raw.replace(/\s*[–—to]+\s*/g, " - ").replace(/\s+/g, " ").trim();
  return AMOUNT_MAP[norm] !== undefined ? norm : raw;
}

let _houseTrades: HouseTradeRow[] | null = null;
let _houseTradesTs = 0;
const HOUSE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function getHouseTrades(): Promise<HouseTradeRow[]> {
  if (_houseTrades && Date.now() - _houseTradesTs < HOUSE_TTL_MS) return _houseTrades;

  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY not set — House Trades requires a Financial Modeling Prep API key");

  const trades: HouseTradeRow[] = [];

  for (let page = 0; page < 50; page++) {
    const rows = await fmpPage("house-trading", page, key);
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const ticker = (row.ticker ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "").trim();
      if (!ticker || ticker.length > 6) continue;

      const disclosureDateStr = (row.dateRecieved ?? row.filingDate ?? "").slice(0, 10);
      const txDate            = (row.transactionDate ?? "").slice(0, 10);
      const year              = disclosureDateStr ? parseInt(disclosureDateStr.slice(0, 4)) || 0 : 0;
      const amtRaw            = row.amount ?? "";
      const amtNorm           = normalizeAmountStr(amtRaw);
      const txType            = row.transactionType ?? "";

      trades.push({
        disclosure_year:        year,
        disclosure_date:        disclosureDateStr,
        transaction_date:       txDate,
        owner:                  "self",
        ticker,
        asset_description:      row.assetDescription ?? row.asset ?? "",
        type:                   txType,
        amount:                 amtNorm,
        representative:         fmpMemberName(row),
        district:               row.district ?? "",
        state:                  row.state ?? "",
        ptr_link:               "",
        cap_gains_over_200_usd: false,
      });
    }

    await new Promise(r => setTimeout(r, 200));
  }

  if (trades.length === 0) {
    // Don't cache empty result — let the next request try FMP again
    throw new Error("FMP house-trading returned no data — may require a paid FMP plan");
  }

  trades.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  _houseTrades   = trades;
  _houseTradesTs = Date.now();
  console.log(`[house-trades] fetched ${trades.length} FMP rows`);
  return trades;
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerQuiverRoutes(app: Express) {
  // S1 — Congress Buys (FMP → Quiver → snapshot)
  app.get("/api/quiver/congress", async (_req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=14400"); // 2h / 4h SWR
      const items = await getCongressPortfolio();
      reply(res, items, { label: "Congress Buys", rebalance: "Weekly" });
    } catch (e) {
      console.error("[quiver/congress]", e);
      res.status(500).json({ error: "Failed to load congress data" });
    }
  });

  // Raw congress trades — last 365 days, individual rows (requires FMP_API_KEY)
  app.get("/api/quiver/congress-trades", async (req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=14400"); // 2h / 4h SWR
      const trades = await getCongressTrades();
      const { ticker, chamber, type, memberName } = req.query as Record<string, string>;

      let filtered = trades;
      if (ticker)     filtered = filtered.filter(t => t.ticker === ticker.toUpperCase());
      if (chamber)    filtered = filtered.filter(t => t.chamber.toLowerCase() === chamber.toLowerCase());
      if (type)       filtered = filtered.filter(t => t.type === type.toLowerCase());
      if (memberName) filtered = filtered.filter(t => t.memberName.toLowerCase().includes(memberName.toLowerCase()));

      res.json({
        trades: filtered,
        total: filtered.length,
        lastUpdated: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[quiver/congress-trades]", e);
      res.status(500).json({ error: "Failed to load congress trades" });
    }
  });

  // S2 — Lobbying Growth
  app.get("/api/quiver/lobbying", async (_req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=14400, stale-while-revalidate=28800"); // 4h / 8h SWR
      const items = await getLobbyingPortfolio();
      reply(res, items, { label: "Lobbying Growth", rebalance: "Monthly" });
    } catch (e) {
      console.error("[quiver/lobbying]", e);
      res.status(500).json({ error: "Failed to load lobbying data" });
    }
  });

  // House PTR trades — all history via FMP house-trading (requires FMP_API_KEY)
  app.get("/api/house-trades", async (_req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=14400"); // 2h / 4h SWR
      const trades = await getHouseTrades();
      res.json({ trades, total: trades.length, lastUpdated: new Date().toISOString() });
    } catch (e) {
      console.error("[house-trades] primary failed, falling back to congress-trades cache:", (e as Error).message);
      // FMP house-trading may require a paid plan. Fall back to the congress-trades
      // cache (which fetches senate+house together) filtered to House chamber.
      try {
        const congressTrades = await getCongressTrades();
        const houseTrades: HouseTradeRow[] = congressTrades
          .filter((t) => t.chamber === "House")
          .map((t) => ({
            disclosure_year:        parseInt(t.transactionDate.slice(0, 4)) || 0,
            disclosure_date:        t.filingDate,
            transaction_date:       t.transactionDate,
            owner:                  "self",
            ticker:                 t.ticker,
            asset_description:      t.assetDescription,
            type:                   t.type === "buy" ? "purchase" : "sale",
            amount:                 t.amount,
            representative:         t.memberName,
            district:               "",
            state:                  t.state ?? "",
            ptr_link:               "",
            cap_gains_over_200_usd: false,
          }));
        res.json({ trades: houseTrades, total: houseTrades.length, lastUpdated: new Date().toISOString() });
      } catch (e2) {
        console.error("[house-trades] fallback also failed:", (e2 as Error).message);
        res.status(503).json({ error: (e as Error).message });
      }
    }
  });

  // S3 — Insider Buys
  app.get("/api/quiver/insider", async (_req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=14400"); // 2h / 4h SWR
      const items = await getInsiderPortfolio();
      reply(res, items, { label: "Insider Buys", rebalance: "Weekly" });
    } catch (e) {
      console.error("[quiver/insider]", e);
      res.status(500).json({ error: "Failed to load insider data" });
    }
  });

  // GET /api/trading/copy-trades?memberName=
  const _copyTradesCache = new Map<string, { data: unknown; ts: number }>();
  const COPY_TRADES_TTL = 60 * 60 * 1000; // 1 hour

  app.get("/api/trading/copy-trades", async (req, res) => {
    const memberName = (req.query.memberName as string ?? "").trim();
    if (!memberName) return res.status(400).json({ error: "memberName is required" });

    res.set("Cache-Control", "public, max-age=1800, stale-while-revalidate=3600"); // 30m / 1h SWR
    const cacheKey = memberName.toLowerCase();
    const cached = _copyTradesCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < COPY_TRADES_TTL) return res.json(cached.data);

    try {
      const allTrades = await getCongressTrades();
      const memberBuys = allTrades.filter(
        (t) =>
          t.memberName.toLowerCase().includes(memberName.toLowerCase()) &&
          t.type === "buy" &&
          t.ticker &&
          t.ticker !== "N/A"
      );

      // Deduplicate by ticker (keep latest buy per ticker)
      const byTicker = new Map<string, typeof memberBuys[number]>();
      for (const t of memberBuys) {
        const existing = byTicker.get(t.ticker);
        if (!existing || t.transactionDate > existing.transactionDate) {
          byTicker.set(t.ticker, t);
        }
      }

      const uniqueTrades = [...byTicker.values()];
      const tickers = uniqueTrades.map((t) => t.ticker);

      // Fetch current prices in batch
      const priceMap = await fetchBatch(tickers);

      const holdings: Array<{
        ticker: string; entryDate: string; currentPrice: number | null;
        amountMidpoint: number; pnlPct: number | null;
      }> = [];
      let totalPnlPct = 0;
      let pnlCount = 0;

      for (const trade of uniqueTrades) {
        const current = priceMap.get(trade.ticker)?.price ?? null;
        const entryMid = parseMidpoint(trade.amount ?? "");
        // We don't have a precise entry price, so we use current price as "unknown"
        // and report pnlPct only when current price is available
        holdings.push({
          ticker: trade.ticker,
          entryDate: trade.transactionDate,
          currentPrice: current,
          amountMidpoint: entryMid,
          pnlPct: null, // precise entry price unavailable without historical bar
        });
      }

      const data = {
        holdings,
        totalPnlPct: pnlCount > 0 ? totalPnlPct / pnlCount : null,
        memberName,
        lastUpdated: new Date().toISOString(),
      };
      _copyTradesCache.set(cacheKey, { data, ts: Date.now() });
      return res.json(data);
    } catch (e) {
      console.error("[copy-trades]", e);
      return res.status(503).json({ error: "Copy trades temporarily unavailable" });
    }
  });
}

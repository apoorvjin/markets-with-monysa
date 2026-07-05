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

function mapNameToTickerStatic(name: string): string | null {
  const upper = name.toUpperCase();
  for (const [key, ticker] of Object.entries(TICKER_MAP)) {
    if (upper.includes(key)) return ticker;
  }
  return null;
}

// Static map only covers ~25 mega-caps — real EDGAR/LDA filers are overwhelmingly
// outside that list. Fall back to Yahoo's fuzzy company search (same endpoint
// /api/search already uses) for anything the static map misses, cached in-memory
// since company↔ticker doesn't change often.
const _tickerLookupCache = new Map<string, string | null>();
// ticker -> real company name, populated whenever resolveTickerForName finds a Yahoo
// match. Lets callers show "Qualcomm Incorporated" instead of falling back to the
// bare ticker when a name isn't in the small curated KNOWN_NAMES map.
const _resolvedNames = new Map<string, string>();

async function resolveTickerForName(rawName: string): Promise<string | null> {
  const upper = rawName.toUpperCase().trim();
  if (!upper) return null;
  const staticHit = mapNameToTickerStatic(upper);
  if (staticHit) return staticHit;
  if (_tickerLookupCache.has(upper)) return _tickerLookupCache.get(upper)!;

  let resolved: string | null = null;
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(rawName)}&quotesCount=3&newsCount=0&lang=en-US&region=US`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(6_000),
    });
    if (resp.ok) {
      const data = await resp.json() as { quotes?: Array<Record<string, unknown>> };
      const firstToken = upper.split(/\s+/).find((t) => t.length >= 3) ?? "";
      const match = (data.quotes ?? []).find((q) => {
        if (!q.isYahooFinance || q.quoteType !== "EQUITY") return false;
        const label = String(q.longname ?? q.shortname ?? "").toUpperCase();
        // Guard against wildly unrelated fuzzy matches (e.g. non-company lobbying
        // clients like trade associations) by requiring some token overlap.
        return firstToken ? label.includes(firstToken) : false;
      });
      const symbol = match?.symbol as string | undefined;
      resolved = symbol && symbol.length <= 6 ? symbol : null;
      if (resolved) {
        const fullName = match?.longname ?? match?.shortname;
        if (typeof fullName === "string" && fullName) _resolvedNames.set(resolved, fullName);
      }
    }
  } catch {
    resolved = null;
  }
  _tickerLookupCache.set(upper, resolved);
  return resolved;
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

// ── Lobbying universe ─────────────────────────────────────────────────────────
// Which real, publicly-traded companies to check for lobbying-spend growth — not
// fabricated data, just a "which securities to look up" list (same pattern as
// ETF_UNIVERSE / index_constituents.ts elsewhere in this codebase). Senate LDA's
// `client_name` filter is a substring match, so registrant-name variants (" INC"
// vs " INCORPORATED", outside counsel filing "on behalf of X") all still match.
const LOBBYING_UNIVERSE: Array<{ name: string; ticker: string; fullName: string }> = [
  { name: "APPLE",          ticker: "AAPL",  fullName: "Apple Inc" },
  { name: "MICROSOFT",      ticker: "MSFT",  fullName: "Microsoft Corp" },
  { name: "ALPHABET",       ticker: "GOOGL", fullName: "Alphabet Inc" },
  { name: "AMAZON",         ticker: "AMZN",  fullName: "Amazon.com" },
  { name: "META PLATFORMS", ticker: "META",  fullName: "Meta Platforms" },
  { name: "QUALCOMM",       ticker: "QCOM",  fullName: "Qualcomm Inc" },
  { name: "INTEL",          ticker: "INTC",  fullName: "Intel Corp" },
  { name: "CISCO",          ticker: "CSCO",  fullName: "Cisco Systems" },
  { name: "ORACLE",         ticker: "ORCL",  fullName: "Oracle Corp" },
  { name: "IBM",            ticker: "IBM",   fullName: "IBM Corp" },
  { name: "NVIDIA",         ticker: "NVDA",  fullName: "NVIDIA Corp" },
  { name: "BROADCOM",       ticker: "AVGO",  fullName: "Broadcom Inc" },
  { name: "SALESFORCE",     ticker: "CRM",   fullName: "Salesforce Inc" },
  { name: "UBER TECHNOLOGIES", ticker: "UBER", fullName: "Uber Technologies" },
  { name: "COINBASE",       ticker: "COIN",  fullName: "Coinbase Global" },
  { name: "PFIZER",         ticker: "PFE",   fullName: "Pfizer Inc" },
  { name: "MERCK",          ticker: "MRK",   fullName: "Merck & Co" },
  { name: "JOHNSON & JOHNSON", ticker: "JNJ", fullName: "Johnson & Johnson" },
  { name: "ABBVIE",         ticker: "ABBV",  fullName: "AbbVie Inc" },
  { name: "BRISTOL-MYERS",  ticker: "BMY",   fullName: "Bristol-Myers Squibb" },
  { name: "ELI LILLY",      ticker: "LLY",   fullName: "Eli Lilly and Co" },
  { name: "AMGEN",          ticker: "AMGN",  fullName: "Amgen Inc" },
  { name: "GILEAD SCIENCES",ticker: "GILD",  fullName: "Gilead Sciences" },
  { name: "UNITEDHEALTH",   ticker: "UNH",   fullName: "UnitedHealth Group" },
  { name: "CVS HEALTH",     ticker: "CVS",   fullName: "CVS Health Corp" },
  { name: "CIGNA",          ticker: "CI",    fullName: "Cigna Group" },
  { name: "HUMANA",         ticker: "HUM",   fullName: "Humana Inc" },
  { name: "LOCKHEED MARTIN",ticker: "LMT",   fullName: "Lockheed Martin" },
  { name: "BOEING",         ticker: "BA",    fullName: "Boeing Co" },
  { name: "RTX CORP",       ticker: "RTX",   fullName: "RTX Corp" },
  { name: "NORTHROP GRUMMAN",ticker: "NOC",  fullName: "Northrop Grumman" },
  { name: "GENERAL DYNAMICS",ticker: "GD",   fullName: "General Dynamics" },
  { name: "L3HARRIS",       ticker: "LHX",   fullName: "L3Harris Technologies" },
  { name: "AT&T",           ticker: "T",     fullName: "AT&T Inc" },
  { name: "VERIZON",        ticker: "VZ",    fullName: "Verizon Communications" },
  { name: "COMCAST",        ticker: "CMCSA", fullName: "Comcast Corp" },
  { name: "T-MOBILE",       ticker: "TMUS",  fullName: "T-Mobile US" },
  { name: "CHARTER COMMUNICATIONS", ticker: "CHTR", fullName: "Charter Communications" },
  { name: "EXXON MOBIL",    ticker: "XOM",   fullName: "Exxon Mobil Corp" },
  { name: "CHEVRON",        ticker: "CVX",   fullName: "Chevron Corp" },
  { name: "CONOCOPHILLIPS", ticker: "COP",   fullName: "ConocoPhillips" },
  { name: "OCCIDENTAL PETROLEUM", ticker: "OXY", fullName: "Occidental Petroleum" },
  { name: "JPMORGAN",       ticker: "JPM",   fullName: "JPMorgan Chase" },
  { name: "BANK OF AMERICA",ticker: "BAC",   fullName: "Bank of America" },
  { name: "GOLDMAN SACHS",  ticker: "GS",    fullName: "Goldman Sachs Group" },
  { name: "MORGAN STANLEY", ticker: "MS",    fullName: "Morgan Stanley" },
  { name: "CITIGROUP",      ticker: "C",     fullName: "Citigroup Inc" },
  { name: "WELLS FARGO",    ticker: "WFC",   fullName: "Wells Fargo & Co" },
  { name: "BLACKROCK",      ticker: "BLK",   fullName: "BlackRock Inc" },
  { name: "VISA INC",       ticker: "V",     fullName: "Visa Inc" },
  { name: "MASTERCARD",     ticker: "MA",    fullName: "Mastercard Inc" },
  { name: "PAYPAL",         ticker: "PYPL",  fullName: "PayPal Holdings" },
  { name: "WALMART",        ticker: "WMT",   fullName: "Walmart Inc" },
  { name: "HOME DEPOT",     ticker: "HD",    fullName: "Home Depot Inc" },
  { name: "TARGET CORP",    ticker: "TGT",   fullName: "Target Corp" },
  { name: "COSTCO",         ticker: "COST",  fullName: "Costco Wholesale" },
  { name: "MCDONALD'S",     ticker: "MCD",   fullName: "McDonald's Corp" },
  { name: "STARBUCKS",      ticker: "SBUX",  fullName: "Starbucks Corp" },
  { name: "GENERAL ELECTRIC",ticker: "GE",   fullName: "GE Aerospace" },
  { name: "HONEYWELL",      ticker: "HON",   fullName: "Honeywell International" },
  { name: "CATERPILLAR",    ticker: "CAT",   fullName: "Caterpillar Inc" },
  { name: "DEERE & COMPANY",ticker: "DE",    fullName: "Deere & Co" },
  { name: "3M COMPANY",     ticker: "MMM",   fullName: "3M Co" },
  { name: "UNITED PARCEL SERVICE", ticker: "UPS", fullName: "United Parcel Service" },
  { name: "FEDEX",          ticker: "FDX",   fullName: "FedEx Corp" },
  { name: "DELTA AIR LINES",ticker: "DAL",   fullName: "Delta Air Lines" },
  { name: "UNITED AIRLINES",ticker: "UAL",   fullName: "United Airlines Holdings" },
  { name: "AMERICAN AIRLINES", ticker: "AAL", fullName: "American Airlines Group" },
  { name: "SOUTHWEST AIRLINES", ticker: "LUV", fullName: "Southwest Airlines" },
  { name: "FORD MOTOR",     ticker: "F",     fullName: "Ford Motor Co" },
  { name: "GENERAL MOTORS", ticker: "GM",    fullName: "General Motors" },
  { name: "TESLA, INC.",    ticker: "TSLA",  fullName: "Tesla Inc" },
  { name: "WALT DISNEY",    ticker: "DIS",   fullName: "Walt Disney Co" },
  { name: "NETFLIX",        ticker: "NFLX",  fullName: "Netflix Inc" },
  { name: "ADVANCED MICRO DEVICES", ticker: "AMD", fullName: "Advanced Micro Devices" },
  { name: "MICRON TECHNOLOGY", ticker: "MU", fullName: "Micron Technology" },
  { name: "ARCHER-DANIELS-MIDLAND", ticker: "ADM", fullName: "Archer-Daniels-Midland" },
  { name: "DOW INC",        ticker: "DOW",   fullName: "Dow Inc" },
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
  lobbyingGrowth?: string | null;
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
  lobbyingGrowth?: string | null;
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

  let ranked: Array<{ ticker: string; amount: number }> | undefined;
  let source = "";

  // Cascade: Quiver (free public) → FMP (key required). No hardcoded snapshot —
  // if both live sources fail, the route returns an honest error instead of
  // silently serving stale fabricated numbers.
  const attempts: Array<[string, () => Promise<NonNullable<typeof ranked>>]> = [
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
  if (!ranked) throw new Error("All congress-buys data sources failed");

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

interface LobbyingResult { ticker: string; name: string; thisQ: number; lastQ: number }

async function fetchLobbyingLive(): Promise<LobbyingResult[]> {
  // Query Senate LDA directly by company name for a curated universe of major public
  // lobbying spenders (LOBBYING_UNIVERSE) instead of randomly sampling pages of *all*
  // filers and hoping a recognizable public company happens to land on the page —
  // in practice it almost never did (see 2026-07 fix notes in CLAUDE.md). `client_name`
  // is a real, working LDA filter (confirmed live); `ordering=-dt_posted` returns
  // most-recent filings first; each row's own `filing_year`/`filing_type` fields give
  // an unambiguous period key (the API's `filing_period_display` text has no year and
  // is identical across years — do not group by that again).
  const settled = await Promise.allSettled(
    LOBBYING_UNIVERSE.map(async (co): Promise<LobbyingResult | null> => {
      const url = `https://lda.senate.gov/api/v1/filings/?client_name=${encodeURIComponent(co.name)}&ordering=-dt_posted&format=json&limit=40`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) throw new Error(`LDA ${resp.status}`);
      const data = await resp.json() as { results?: Array<Record<string, unknown>> };

      const byPeriod = new Map<string, number>();
      for (const row of data.results ?? []) {
        const year = row.filing_year as number | undefined;
        const type = String(row.filing_type ?? "");
        if (!year || !/^Q[1-4]/.test(type)) continue; // skip non-quarterly filing types (registrations, terminations, etc.)
        const amount = parseFloat(String(row.income ?? row.expenses ?? "0"));
        if (!amount) continue;
        const period = `${year}-${type.slice(0, 2)}`;
        byPeriod.set(period, (byPeriod.get(period) ?? 0) + amount);
      }

      const periods = Array.from(byPeriod.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      if (periods.length < 2) return null;
      const lastQ = periods[periods.length - 1][1];
      const prevQ = periods[periods.length - 2][1];
      if (prevQ === 0) return null;
      return { ticker: co.ticker, name: co.fullName, thisQ: lastQ, lastQ: prevQ };
    }),
  );

  const ranked = settled
    .filter((r): r is PromiseFulfilledResult<LobbyingResult> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);

  if (ranked.length < 3) throw new Error("Insufficient LDA data");

  return ranked.sort((a, b) => {
    const ga = (a.thisQ - a.lastQ) / a.lastQ;
    const gb = (b.thisQ - b.lastQ) / b.lastQ;
    return gb - ga;
  }).slice(0, 10);
}

async function getLobbyingPortfolio(): Promise<QuiverItem[]> {
  const cached = getCached<QuiverItem[]>("lobbying");
  if (cached) return cached;

  let ranked: LobbyingResult[] = [];
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
      name:       r.name,
      weight:     1 / n,
      badge:      `${growth >= 0 ? "+" : ""}${(growth * 100).toFixed(0)}%`,
      badgeLabel: "QoQ spend",
    };
  });

  const items = await enrichWithPrices(prepared);
  console.log(`[quiver/lobbying] source=live items=${items.length}`);
  setCached("lobbying", items);
  return items;
}

// Ticker → QoQ lobbying-growth badge (e.g. "+42%"), for cross-linking against
// congress buys/trades. Reuses getLobbyingPortfolio's own cache — no extra fetch.
async function getLobbyingBadgeMap(): Promise<Map<string, string>> {
  const items = await getLobbyingPortfolio();
  return new Map(items.map((i) => [i.symbol, i.badge]));
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

  // display_names format: ["Person Name  (CIK 0001234567)", "COMPANY NAME  (CIK 0001022321)"]
  // ticker/entity_name fields don't exist in EDGAR search-index responses. The issuer
  // (company) is consistently the last entry — resolve that one per hit via
  // resolveTickerForName (static map + Yahoo search fallback) rather than the tiny
  // static-only map, which almost never matched real (non-mega-cap) filers.
  const companyNames = hits.map((h) => {
    const displayNames = (h._source?.display_names as string[] | undefined) ?? [];
    const last = displayNames[displayNames.length - 1] ?? "";
    return last.split(/\s{2,}\(CIK/)[0].trim().toUpperCase();
  });
  const resolved = await Promise.all(
    [...new Set(companyNames)].map(async (n) => [n, await resolveTickerForName(n)] as const),
  );
  const tickerByName = new Map(resolved);

  const counts = new Map<string, number>();
  for (const name of companyNames) {
    const ticker = tickerByName.get(name);
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

  // display_names: issuer (company) is consistently the last entry, filer(s) precede it.
  const hitNames = hits.map((h) => {
    const displayNames = (h._source?.display_names as string[] | undefined) ?? [];
    return displayNames.map((entry) => entry.split(/\s{2,}\(CIK/)[0].trim().toUpperCase());
  });
  const companyNames = hitNames.map((names) => names[names.length - 1] ?? "");
  const resolved = await Promise.all(
    [...new Set(companyNames)].map(async (n) => [n, await resolveTickerForName(n)] as const),
  );
  const tickerByName = new Map(resolved);

  // Per ticker: set of distinct insider (person) names + total filing count.
  const clusters = new Map<string, { insiders: Set<string>; filings: number }>();
  for (const names of hitNames) {
    const companyName = names[names.length - 1] ?? "";
    const ticker = tickerByName.get(companyName);
    const person = names[0];
    if (!ticker || ticker.length > 6 || !person || person === companyName) continue;
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
    name:       _resolvedNames.get(r.ticker) ?? KNOWN_NAMES[r.ticker] ?? r.ticker,
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
    res.set("Cache-Control", "public, max-age=7200, stale-while-revalidate=14400"); // 2h / 4h SWR
    try {
      const items = await getCongressPortfolio();
      const lobbyingBadges = await getLobbyingBadgeMap();
      const enriched = items.map((i) => ({ ...i, lobbyingGrowth: lobbyingBadges.get(i.symbol) ?? null }));
      reply(res, enriched, { label: "Congress Buys", rebalance: "Weekly" });
    } catch (e) {
      // Respond 200 + empty list, not 500 — a non-2xx here throws a client-side
      // exception (Dio) whose handling can't be verified against every already-shipped
      // app build. Empty data is unambiguously safe for any client to render as
      // "nothing to show" without depending on that build having an error branch.
      console.error("[quiver/congress]", e);
      reply(res, [], { label: "Congress Buys", rebalance: "Weekly" });
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

      const lobbyingBadges = await getLobbyingBadgeMap();
      const enriched = filtered.map(t => ({ ...t, lobbyingGrowth: lobbyingBadges.get(t.ticker) ?? null }));

      res.json({
        trades: enriched,
        total: enriched.length,
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

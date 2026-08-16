// CIK resolution for SPLC (Supply Chain Analysis). SEC's per-company APIs
// (companyconcept/companyfacts) are non-dimensional and can't carry the
// ConcentrationRiskPercentage1 facts SPLC needs — those only exist in the
// bulk Notes Data Sets (see sec-notes-ingest.ts), which are keyed by CIK,
// not ticker. This module is the ticker -> CIK bridge everything else in
// SPLC depends on.

import { secFetch } from "./sec-fetch";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // ticker/CIK mapping changes rarely

export interface SplcEntity {
  ticker: string;
  cik: string; // zero-padded to 10 digits, as SEC's per-CIK endpoints require
  name: string;
}

interface SecTickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

const LEGAL_SUFFIXES = /\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|PLC|SA|NV|AG|GROUP|HOLDINGS|HOLDING)\b\.?/gi;

// Filers often qualify a counterparty rather than naming it bare —
// "BiogenCollaborations", "MedicareRevenue". Stripping these trailing
// qualifiers recovers the underlying company. Order matters: longest first.
const TRAILING_QUALIFIERS = [
  "COLLABORATIONS", "COLLABORATION", "AGREEMENTS", "AGREEMENT",
  "REVENUES", "REVENUE", "CONTRACTS", "CONTRACT", "ANDSUBSIDIARIES", "SUBSIDIARIES",
];

/** Uppercase, strip legal suffixes and punctuation — for matching a disclosed
 * counterparty name (e.g. "WalmartInc") against SEC's company_tickers title
 * (e.g. "WALMART INC"). Exact-match only, deliberately — this is for named,
 * already-disclosed counterparties, not the anonymized-member guessing
 * problem (that's out of scope for v1; see sec-notes-ingest.ts). */
function normalizeName(name: string): string {
  return name.replace(LEGAL_SUFFIXES, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/** Normalized form plus progressively-stripped variants, most specific first. */
function nameVariants(name: string): string[] {
  const base = normalizeName(name);
  const out = [base];
  for (const q of TRAILING_QUALIFIERS) {
    if (base.endsWith(q) && base.length > q.length + 2) out.push(base.slice(0, -q.length));
  }
  return out;
}

let cache: {
  byTicker: Map<string, SplcEntity>;
  byName: Map<string, SplcEntity>;
  byCik: Map<string, SplcEntity>;
  ts: number;
} | null = null;

async function loadTickerMap(): Promise<{
  byTicker: Map<string, SplcEntity>;
  byName: Map<string, SplcEntity>;
  byCik: Map<string, SplcEntity>;
}> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache;

  const res = await secFetch(TICKERS_URL);
  if (!res.ok) {
    if (cache) return cache; // serve stale rather than fail
    throw new Error(`SEC company_tickers.json fetch failed: ${res.status}`);
  }

  const rows: Record<string, SecTickerRow> = await res.json();
  const byTicker = new Map<string, SplcEntity>();
  const byName = new Map<string, SplcEntity>();
  const byCik = new Map<string, SplcEntity>();
  for (const row of Object.values(rows)) {
    const entity: SplcEntity = {
      ticker: row.ticker.toUpperCase(),
      cik: String(row.cik_str).padStart(10, "0"),
      name: row.title,
    };
    byTicker.set(entity.ticker, entity);
    // First ticker wins on a collision (e.g. dual-class shares) — fine, these
    // indexes only need to resolve to *an* entity for that company.
    const key = normalizeName(row.title);
    if (!byName.has(key)) byName.set(key, entity);
    if (!byCik.has(entity.cik)) byCik.set(entity.cik, entity);
  }

  cache = { byTicker, byName, byCik, ts: Date.now() };
  return cache;
}

export async function resolveEntity(ticker: string): Promise<SplcEntity | null> {
  const { byTicker } = await loadTickerMap();
  return byTicker.get(ticker.toUpperCase()) ?? null;
}

export async function resolveEntities(tickers: string[]): Promise<SplcEntity[]> {
  const { byTicker } = await loadTickerMap();
  return tickers
    .map((t) => byTicker.get(t.toUpperCase()))
    .filter((e): e is SplcEntity => e !== undefined);
}

/** Resolves a disclosed (non-anonymized) counterparty name to a public-company
 * CIK. Returns null for anything that doesn't exact-match after
 * normalization — including real but non-public counterparties like
 * "UnitedStatesGovernment", which have no CIK/ticker and stay disclosed-only. */
/** CIK -> ticker. A filer with no ticker can't be a graph centre (nothing for
 * the UI to link to), so the batch uses this to decide who belongs. */
export async function resolveEntityByCik(cik: string): Promise<SplcEntity | null> {
  const { byCik } = await loadTickerMap();
  return byCik.get(cik.padStart(10, "0")) ?? null;
}

export async function resolveEntityByName(name: string): Promise<SplcEntity | null> {
  const { byName } = await loadTickerMap();
  for (const v of nameVariants(name)) {
    const hit = byName.get(v);
    if (hit) return hit;
  }
  return null;
}

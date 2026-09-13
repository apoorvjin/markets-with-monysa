// Single entry point for pulling BIS (Bank for International Settlements) macro
// series used by the Country Health panel. BIS's SDMX REST API is free,
// keyless, and each of these queries returns EVERY country for a dataflow in
// one request — so we fetch bulk (6 requests total, refreshed daily) rather
// than per-country. Verified against the live API (2026-09):
//   WS_CBPOL       M.<REF_AREA>              — central bank policy rates
//   WS_EER         M.R.B.<REF_AREA>          — real effective exchange rate, broad basket
//   WS_TC          Q.<CTY>.P.A.M.770.A       — private non-fin credit, % of GDP, market value, break-adjusted
//   WS_CREDIT_GAP  Q.<CTY>.P.A.C             — credit-to-GDP gap (actual minus HP-filter trend), BIS's own number
//   WS_DSR         Q.<CTY>.P                 — debt service ratio, private non-financial sector
//   WS_SPP         Q.<REF_AREA>.N.771        — residential property prices, nominal YoY %
// An empty REF_AREA/BORROWERS_CTY position in the key is a wildcard = "all countries".

const BIS_BASE = "https://stats.bis.org/api/v1/data";
// ~13 years of history: enough for a trailing-10Y window at any point in the year.
const START_PERIOD = "2013-01";

export type BisPoint = { period: string; value: number };
export type BisSeriesMap = Map<string, BisPoint[]>; // country/area code -> points, ascending by period

export type BisRawData = {
  policyRate: BisSeriesMap;
  creditToGdp: BisSeriesMap;
  creditGap: BisSeriesMap;
  debtServiceRatio: BisSeriesMap;
  propertyPriceYoy: BisSeriesMap;
  reer: BisSeriesMap;
  fetchedAt: string;
};

// Minimal RFC-4180 CSV line parser — same convention as heatmap.ts/oge.ts/markets.ts.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseBisSeries(csv: string): BisSeriesMap {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const out: BisSeriesMap = new Map();
  if (lines.length < 2) return out;

  const header = parseCsvLine(lines[0]);
  const countryIdx = header.indexOf("REF_AREA") !== -1 ? header.indexOf("REF_AREA") : header.indexOf("BORROWERS_CTY");
  const periodIdx = header.indexOf("TIME_PERIOD");
  const valueIdx = header.indexOf("OBS_VALUE");
  if (countryIdx === -1 || periodIdx === -1 || valueIdx === -1) return out;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const country = row[countryIdx];
    const period = row[periodIdx];
    const value = Number(row[valueIdx]);
    if (!country || !period || !Number.isFinite(value)) continue;
    const arr = out.get(country);
    if (arr) arr.push({ period, value });
    else out.set(country, [{ period, value }]);
  }
  for (const arr of out.values()) arr.sort((a, b) => a.period.localeCompare(b.period));
  return out;
}

async function fetchBisSeries(flowRef: string, key: string): Promise<BisSeriesMap> {
  const url = `${BIS_BASE}/${flowRef}/${key}/all?startPeriod=${START_PERIOD}&format=csv`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  // BIS returns HTTP 200 with an XML error envelope (not a CSV) when a key
  // matches no series — treat that the same as "no data" rather than throwing,
  // since a single missing series shouldn't fail the whole bulk refresh.
  if (!res.ok || text.trimStart().startsWith("<?xml") || text.trimStart().startsWith("<message:Error")) {
    console.warn(`[bis-fetch] ${flowRef} (${key}) returned no data`);
    return new Map();
  }
  return parseBisSeries(text);
}

export async function fetchAllBisSeries(): Promise<BisRawData> {
  const [policyRate, creditToGdp, creditGap, debtServiceRatio, propertyPriceYoy, reer] = await Promise.all([
    fetchBisSeries("WS_CBPOL", "M."),
    fetchBisSeries("WS_TC", "Q..P.A.M.770.A"),
    fetchBisSeries("WS_CREDIT_GAP", "Q..P.A.C"),
    fetchBisSeries("WS_DSR", "Q..P"),
    fetchBisSeries("WS_SPP", "Q..N.771"),
    fetchBisSeries("WS_EER", "M.R.B."),
  ]);
  return {
    policyRate, creditToGdp, creditGap, debtServiceRatio, propertyPriceYoy, reer,
    fetchedAt: new Date().toISOString(),
  };
}

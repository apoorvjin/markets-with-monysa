// Pure derive layer for Country Health — turns raw BIS series into the 5
// panel rows. Every row is a real published number plus ONE mechanical
// comparison (vs. its own trailing 10Y average, or vs. BIS's own published
// credit-gap trend) and a label from a FIXED, DOCUMENTED threshold below.
// Deliberately no weighted/blended composite score of any kind — see the
// Country Health scoping discussion: an invented 0-10 "risk score" has no
// BIS methodology behind it and reads as fake precision.

import type { BisPoint, BisRawData } from "./bis-fetch";

export type CountryHealthMetricKey =
  | "policy_rate"
  | "credit_gdp"
  | "debt_service_ratio"
  | "property_price_yoy"
  | "reer";

export type CountryHealthMetric = {
  key: CountryHealthMetricKey;
  label: string;
  available: boolean;
  value: number | null;
  unit: string;
  change3m: number | null;   // policy rate only, basis points
  change12m: number | null;  // policy rate only, basis points
  deviation10y: number | null; // pp (credit gap / DSR / property) or % (REER) vs its own trailing 10Y
  tag: string | null;        // rule-based label, see thresholds below
  asOf: string | null;       // BIS TIME_PERIOD of the latest observation used
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function yearOf(period: string): number {
  return parseInt(period.slice(0, 4), 10);
}

function trailingWindow(points: BisPoint[], years: number): BisPoint[] {
  if (points.length === 0) return [];
  const latestYear = yearOf(points[points.length - 1].period);
  return points.filter((p) => yearOf(p.period) > latestYear - years);
}

function average(points: BisPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.value, 0) / points.length;
}

function shiftMonth(period: string, monthsBack: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) - monthsBack;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Latest point at or before `period` — tolerant of gaps in a monthly series. */
function findAtOrBefore(points: BisPoint[], period: string): BisPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].period <= period) return points[i];
  }
  return null;
}

function unavailable(key: CountryHealthMetricKey, label: string, unit: string): CountryHealthMetric {
  return { key, label, available: false, value: null, unit, change3m: null, change12m: null, deviation10y: null, tag: null, asOf: null };
}

// Policy rate cycle threshold: ±25bp over 12M is BIS's own typical "one meeting's
// worth" move size for major central banks — smaller than that reads as noise, not a cycle.
function buildPolicyRateMetric(points: BisPoint[] | undefined): CountryHealthMetric {
  if (!points || points.length === 0) return unavailable("policy_rate", "Policy Rate", "%");
  const latest = points[points.length - 1];
  const p3 = findAtOrBefore(points, shiftMonth(latest.period, 3));
  const p12 = findAtOrBefore(points, shiftMonth(latest.period, 12));
  const change3m = p3 && p3.period !== latest.period ? round2((latest.value - p3.value) * 100) : null;
  const change12m = p12 && p12.period !== latest.period ? round2((latest.value - p12.value) * 100) : null;
  let tag: string | null = null;
  if (change12m !== null) {
    tag = change12m <= -25 ? "Easing" : change12m >= 25 ? "Tightening" : "Neutral";
  }
  return { key: "policy_rate", label: "Policy Rate", available: true, value: latest.value, unit: "%", change3m, change12m, deviation10y: null, tag, asOf: latest.period };
}

// Credit gap thresholds mirror BIS's own published early-warning framework:
// >10pp is BIS's literature-cited early-warning line for banking-crisis risk;
// 2-10pp is "building above trend" but below that line.
function buildCreditMetric(creditPoints: BisPoint[] | undefined, gapPoints: BisPoint[] | undefined): CountryHealthMetric {
  if (!gapPoints || gapPoints.length === 0) return unavailable("credit_gdp", "Private Credit / GDP", "% of GDP");
  const latestGap = gapPoints[gapPoints.length - 1];
  const tag =
    latestGap.value > 10 ? "Above BIS early-warning threshold" :
    latestGap.value > 2 ? "Above trend" :
    latestGap.value < -2 ? "Below trend" : "At trend";
  const latestCredit = creditPoints && creditPoints.length > 0 ? creditPoints[creditPoints.length - 1].value : null;
  return { key: "credit_gdp", label: "Private Credit / GDP", available: true, value: latestCredit, unit: "% of GDP", change3m: null, change12m: null, deviation10y: round2(latestGap.value), tag, asOf: latestGap.period };
}

function buildDsrMetric(points: BisPoint[] | undefined): CountryHealthMetric {
  if (!points || points.length === 0) return unavailable("debt_service_ratio", "Debt Service Ratio", "%");
  const latest = points[points.length - 1];
  const avg10y = average(trailingWindow(points, 10));
  let tag: string | null = null;
  let deviation10y: number | null = null;
  if (avg10y !== null) {
    deviation10y = round2(latest.value - avg10y);
    tag = deviation10y > 1 ? "Rising" : deviation10y < -1 ? "Falling" : "Stable";
  }
  return { key: "debt_service_ratio", label: "Debt Service Ratio", available: true, value: latest.value, unit: "%", change3m: null, change12m: null, deviation10y, tag, asOf: latest.period };
}

function buildPropertyMetric(points: BisPoint[] | undefined): CountryHealthMetric {
  if (!points || points.length === 0) return unavailable("property_price_yoy", "Property Prices (YoY)", "% YoY");
  const latest = points[points.length - 1];
  const avg10y = average(trailingWindow(points, 10));
  let tag: string | null = null;
  let deviation10y: number | null = null;
  if (avg10y !== null) {
    deviation10y = round2(latest.value - avg10y);
    tag = deviation10y > 2 ? "Accelerating" : deviation10y < -2 ? "Decelerating" : "Stable";
  }
  return { key: "property_price_yoy", label: "Property Prices (YoY)", available: true, value: latest.value, unit: "% YoY", change3m: null, change12m: null, deviation10y, tag, asOf: latest.period };
}

// REER thresholds: ±10% vs. its own trailing 10Y average. Exported — reused
// as-is by FIN-21 (Currency Valuation on Forex), which is currency/area-only
// and has no other country-specific logic, so there's nothing to duplicate.
export function buildReerMetric(points: BisPoint[] | undefined): CountryHealthMetric {
  if (!points || points.length === 0) return unavailable("reer", "Real Effective Exchange Rate", "index (2020=100)");
  const latest = points[points.length - 1];
  const avg10y = average(trailingWindow(points, 10));
  let tag: string | null = null;
  let deviationPct: number | null = null;
  if (avg10y) {
    deviationPct = round2(((latest.value - avg10y) / avg10y) * 100);
    tag = deviationPct > 10 ? "Historically rich" : deviationPct < -10 ? "Historically cheap" : "Neutral";
  }
  return { key: "reer", label: "Real Effective Exchange Rate", available: true, value: latest.value, unit: "index (2020=100)", change3m: null, change12m: null, deviation10y: deviationPct, tag, asOf: latest.period };
}

export function buildCountryHealth(countryCode: string, raw: BisRawData): CountryHealthMetric[] {
  return [
    buildPolicyRateMetric(raw.policyRate.get(countryCode)),
    buildCreditMetric(raw.creditToGdp.get(countryCode), raw.creditGap.get(countryCode)),
    buildDsrMetric(raw.debtServiceRatio.get(countryCode)),
    buildPropertyMetric(raw.propertyPriceYoy.get(countryCode)),
    buildReerMetric(raw.reer.get(countryCode)),
  ];
}

/** Every country/area code BIS returned data for, across any of the 6 series — callers
 *  should intersect this with FinBrio's own known country list to drop BIS area
 *  aggregates (e.g. "XM" euro area, "4T"/"5A" regional groups) that aren't real countries. */
export function buildBisCoverage(raw: BisRawData): string[] {
  const set = new Set<string>();
  for (const series of [raw.policyRate, raw.creditToGdp, raw.creditGap, raw.debtServiceRatio, raw.propertyPriceYoy, raw.reer]) {
    for (const code of series.keys()) set.add(code);
  }
  return [...set].sort();
}

// Cross-country ranking (2026-09): deliberately a COUNT, not a score. Each of
// the 5 metrics already has a fixed-threshold label; "flagged" means that
// label landed on its single most-stressed value. No weights, no blending —
// same shape as the "3 of 3 strategies say HOLD" consensus line already used
// elsewhere in this app (Trading -> Evaluate), just counting agreement rather
// than combining numbers into one invented figure.
const STRESSED_TAG: Record<CountryHealthMetricKey, string> = {
  policy_rate: "Tightening",
  credit_gdp: "Above BIS early-warning threshold",
  debt_service_ratio: "Rising",
  property_price_yoy: "Accelerating",
  reer: "Historically rich",
};

export type CountryHealthFlagSummary = {
  countryCode: string;
  flaggedCount: number;
  // Out of how many metrics actually HAD data — a country with only 2
  // available metrics and both flagged is "2 of 2", never inflated or
  // deflated by treating missing data as "calm". Comparing countries with
  // very different availableCount is left to the caller/UI to caveat.
  availableCount: number;
};

export function summarizeCountryHealthFlags(countryCode: string, raw: BisRawData): CountryHealthFlagSummary {
  const metrics = buildCountryHealth(countryCode, raw);
  let flaggedCount = 0;
  let availableCount = 0;
  for (const m of metrics) {
    if (!m.available) continue;
    availableCount++;
    if (m.tag === STRESSED_TAG[m.key]) flaggedCount++;
  }
  return { countryCode, flaggedCount, availableCount };
}

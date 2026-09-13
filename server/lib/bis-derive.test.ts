import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCountryHealth, buildBisCoverage, summarizeCountryHealthFlags } from "./bis/bis-derive";
import type { BisRawData, BisPoint } from "./bis/bis-fetch";

function monthly(startYear: number, count: number, values: number[]): BisPoint[] {
  const out: BisPoint[] = [];
  let y = startYear, m = 1;
  for (let i = 0; i < count; i++) {
    out.push({ period: `${y}-${String(m).padStart(2, "0")}`, value: values[i] });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function quarterly(startYear: number, count: number, values: number[]): BisPoint[] {
  const out: BisPoint[] = [];
  let y = startYear, q = 1;
  for (let i = 0; i < count; i++) {
    out.push({ period: `${y}-Q${q}`, value: values[i] });
    q++;
    if (q > 4) { q = 1; y++; }
  }
  return out;
}

function emptyRaw(overrides: Partial<BisRawData> = {}): BisRawData {
  return {
    policyRate: new Map(), creditToGdp: new Map(), creditGap: new Map(),
    debtServiceRatio: new Map(), propertyPriceYoy: new Map(), reer: new Map(),
    fetchedAt: "2026-09-12T00:00:00.000Z",
    ...overrides,
  };
}

test("policy rate: 12M drop of 125bp tags Easing", () => {
  const points = monthly(2025, 13, [4.50, 4.50, 4.25, 4.25, 4.00, 4.00, 3.75, 3.75, 3.50, 3.50, 3.25, 3.25, 3.25]);
  const raw = emptyRaw({ policyRate: new Map([["US", points]]) });
  const [rate] = buildCountryHealth("US", raw);
  assert.equal(rate.available, true);
  assert.equal(rate.tag, "Easing");
  assert.equal(rate.change12m, -125);
});

test("policy rate: flat 12M tags Neutral", () => {
  const points = monthly(2025, 13, Array(13).fill(2.0));
  const raw = emptyRaw({ policyRate: new Map([["EU", points]]) });
  const [rate] = buildCountryHealth("EU", raw);
  assert.equal(rate.tag, "Neutral");
  assert.equal(rate.change12m, 0);
});

test("credit gap above 10pp tags the BIS early-warning label, not just 'above trend'", () => {
  const gap = quarterly(2024, 4, [8, 9, 11, 12]);
  const raw = emptyRaw({ creditGap: new Map([["CN", gap]]) });
  const [, credit] = buildCountryHealth("CN", raw);
  assert.equal(credit.available, true);
  assert.equal(credit.tag, "Above BIS early-warning threshold");
  assert.equal(credit.deviation10y, 12);
});

test("credit gap near zero tags At trend", () => {
  const gap = quarterly(2024, 4, [0.5, -0.5, 1, -1]);
  const raw = emptyRaw({ creditGap: new Map([["JP", gap]]) });
  const [, credit] = buildCountryHealth("JP", raw);
  assert.equal(credit.tag, "At trend");
});

test("REER 15% above its own 10Y average tags Historically rich", () => {
  const points = monthly(2016, 24, [100, ...Array(22).fill(100), 115]);
  const raw = emptyRaw({ reer: new Map([["JP", points]]) });
  const [, , , , reer] = buildCountryHealth("JP", raw);
  assert.equal(reer.available, true);
  assert.equal(reer.tag, "Historically rich");
});

test("a country with no series anywhere returns all-unavailable rows, never a fabricated value", () => {
  const raw = emptyRaw();
  const metrics = buildCountryHealth("KP", raw);
  assert.equal(metrics.length, 5);
  for (const m of metrics) {
    assert.equal(m.available, false);
    assert.equal(m.value, null);
    assert.equal(m.tag, null);
  }
});

test("summarizeCountryHealthFlags counts only flagged metrics that had data, never guesses on missing ones", () => {
  // Only REER available, and it's flagged (Historically rich) — should read
  // "1 of 1", not "1 of 5" (the other 4 weren't silently counted as calm).
  const reerPoints = monthly(2016, 24, [100, ...Array(22).fill(100), 120]);
  const raw = emptyRaw({ reer: new Map([["JP", reerPoints]]) });
  const summary = summarizeCountryHealthFlags("JP", raw);
  assert.equal(summary.flaggedCount, 1);
  assert.equal(summary.availableCount, 1);
});

test("summarizeCountryHealthFlags: a country with zero data everywhere is 0 of 0, not 0 of 5", () => {
  const raw = emptyRaw();
  const summary = summarizeCountryHealthFlags("KP", raw);
  assert.equal(summary.flaggedCount, 0);
  assert.equal(summary.availableCount, 0);
});

test("summarizeCountryHealthFlags: Neutral/Stable/At-trend tags never count as flagged", () => {
  const flatPolicy = monthly(2025, 13, Array(13).fill(2.0)); // Neutral
  const flatGap = quarterly(2024, 4, [0.5, -0.5, 1, -1]); // At trend
  const raw = emptyRaw({ policyRate: new Map([["EU", flatPolicy]]), creditGap: new Map([["EU", flatGap]]) });
  const summary = summarizeCountryHealthFlags("EU", raw);
  assert.equal(summary.flaggedCount, 0);
  assert.equal(summary.availableCount, 2);
});

test("buildBisCoverage unions codes across all six series", () => {
  const raw = emptyRaw({
    policyRate: new Map([["US", []]]),
    reer: new Map([["US", []], ["NL", []]]),
    debtServiceRatio: new Map([["JP", []]]),
  });
  assert.deepEqual(buildBisCoverage(raw), ["JP", "NL", "US"]);
});

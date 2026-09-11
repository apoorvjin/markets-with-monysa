import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTriggerMinutes, aggregateSectorGainers, nowInMarketTz } from "./premarket-sector-notifier";

test("computeTriggerMinutes: US reproduces the original literal spec (1hr after 4:00am start, 1hr before 9:30am open)", () => {
  const { early, late } = computeTriggerMinutes(4 * 60, 9 * 60 + 30);
  assert.equal(early, 5 * 60); // 5:00 AM
  assert.equal(late, 8 * 60 + 30); // 8:30 AM
});

test("computeTriggerMinutes: India's 15-minute window stays fully inside the pre-market session", () => {
  const { early, late } = computeTriggerMinutes(9 * 60, 9 * 60 + 15);
  assert.ok(early > 9 * 60 && early < 9 * 60 + 15);
  assert.ok(late > early && late < 9 * 60 + 15);
});

test("computeTriggerMinutes: early always precedes late, and both stay within the window, for every window length", () => {
  for (const windowMin of [15, 30, 60, 90, 330]) {
    const start = 8 * 60;
    const { early, late } = computeTriggerMinutes(start, start + windowMin);
    assert.ok(early > start, `early (${early}) should be after start (${start})`);
    assert.ok(late > early, `late (${late}) should be after early (${early})`);
    assert.ok(late < start + windowMin, `late (${late}) should be before open (${start + windowMin})`);
  }
});

test("aggregateSectorGainers: market-cap-weighted average, not a simple average", () => {
  const gains = aggregateSectorGainers([
    { sector: "Technology", marketCap: 900, preMarketChangePercent: 2.0 },
    { sector: "Technology", marketCap: 100, preMarketChangePercent: -6.0 },
  ]);
  // (900*2.0 + 100*-6.0) / 1000 = (1800 - 600) / 1000 = 1.2
  assert.equal(gains.length, 1);
  assert.equal(gains[0].sector, "Technology");
  assert.ok(Math.abs(gains[0].changePct - 1.2) < 1e-9);
});

test("aggregateSectorGainers: ranks sectors descending and caps at topN", () => {
  const gains = aggregateSectorGainers(
    [
      { sector: "A", marketCap: 100, preMarketChangePercent: 1 },
      { sector: "B", marketCap: 100, preMarketChangePercent: 3 },
      { sector: "C", marketCap: 100, preMarketChangePercent: 2 },
    ],
    2,
  );
  assert.deepEqual(gains.map((g) => g.sector), ["B", "C"]);
});

test("aggregateSectorGainers: drops stocks missing marketCap or preMarketChangePercent", () => {
  const gains = aggregateSectorGainers([
    { sector: "Technology", marketCap: null, preMarketChangePercent: 5 },
    { sector: "Technology", marketCap: 100, preMarketChangePercent: null },
    { sector: "Energy", marketCap: 100, preMarketChangePercent: 1 },
  ]);
  assert.deepEqual(gains.map((g) => g.sector), ["Energy"]);
});

test("aggregateSectorGainers: a missing sector is dropped, never surfaced as a fake \"Unknown\" bucket", () => {
  // Regression: an earlier version bucketed these as "Unknown" and ranked
  // it like a real sector — confirmed live 2026-09-09, it outranked every
  // actual sector in a real push ("Unknown leading +1.5%").
  const gains = aggregateSectorGainers([
    { sector: null, marketCap: 100_000, preMarketChangePercent: 5 }, // huge cap, huge move — must still be excluded
    { sector: "Energy", marketCap: 100, preMarketChangePercent: 1 },
  ]);
  assert.deepEqual(gains.map((g) => g.sector), ["Energy"]);
});

test("aggregateSectorGainers: empty input produces no gainers", () => {
  assert.deepEqual(aggregateSectorGainers([]), []);
});

test("nowInMarketTz: recognizes a Saturday as a weekend (empty dateKey)", () => {
  // 2026-09-05 is a Saturday.
  const { dateKey } = nowInMarketTz("America/New_York", new Date("2026-09-05T12:00:00Z"));
  assert.equal(dateKey, "");
});

test("nowInMarketTz: a weekday returns a real dateKey and correct local minutes", () => {
  // 2026-09-08 is a Tuesday. 13:30 UTC = 09:30 ET (EDT, UTC-4 in September).
  const { dateKey, minutes } = nowInMarketTz("America/New_York", new Date("2026-09-08T13:30:00Z"));
  assert.equal(dateKey, "2026-09-08");
  assert.equal(minutes, 9 * 60 + 30);
});

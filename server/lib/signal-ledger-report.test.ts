import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSeriesVersion,
  splitByVersion,
  summarizeSeries,
  readinessVerdict,
  estimateTimeoutEta,
  type SeriesStatsDoc,
} from "./signal-ledger-report";

const doc = (overrides: Partial<SeriesStatsDoc> & { seriesKey: string }): SeriesStatsDoc => ({
  trades: 0, wins: 0, sumReturnPct: 0, exitSL: 0, exitTP: 0, exitTIMEOUT: 0,
  ...overrides,
});

test("parseSeriesVersion: extracts the trailing version segment", () => {
  assert.equal(parseSeriesVersion("5|1d|2"), 2);
  assert.equal(parseSeriesVersion("12|1d|1"), 1);
});

test("parseSeriesVersion: throws on a malformed key rather than silently returning NaN/0", () => {
  assert.throws(() => parseSeriesVersion("not-a-series-key"));
});

// ── splitByVersion ───────────────────────────────────────────────────────
// This is the exact bug from 2026-08-28: a stale-version series (frozen,
// contaminated data from before a resolution-logic fix) got summed into a
// "ready" verdict alongside real current data, at a 91%-of-total ratio.

test("splitByVersion: current = max version only, legacy = everything older", () => {
  const docs = [
    doc({ seriesKey: "1|1d|1", trades: 198 }), // legacy — pre-fix
    doc({ seriesKey: "1|1d|2", trades: 19 }),  // current
    doc({ seriesKey: "2|1d|2", trades: 19 }),  // current
  ];
  const { current, legacy, maxVersion } = splitByVersion(docs);
  assert.equal(maxVersion, 2);
  assert.deepEqual(current.map(d => d.seriesKey).sort(), ["1|1d|2", "2|1d|2"]);
  assert.deepEqual(legacy.map(d => d.seriesKey), ["1|1d|1"]);
});

test("splitByVersion: docs with trades === 0 are ignored entirely (don't count toward maxVersion)", () => {
  const docs = [
    doc({ seriesKey: "1|1d|3", trades: 0 }), // a version bump with nothing accrued yet
    doc({ seriesKey: "1|1d|2", trades: 40 }),
  ];
  const { current, maxVersion } = splitByVersion(docs);
  assert.equal(maxVersion, 2);
  assert.deepEqual(current.map(d => d.seriesKey), ["1|1d|2"]);
});

test("splitByVersion: no docs with trades — empty result, not a crash", () => {
  assert.deepEqual(splitByVersion([]), { current: [], legacy: [], maxVersion: 0 });
});

// ── summarizeSeries ──────────────────────────────────────────────────────

test("summarizeSeries: computes win rate and avg return correctly, no double scaling", () => {
  const docs = [doc({ seriesKey: "12|1d|2", trades: 203, wins: 18, sumReturnPct: -441.02 })];
  const [row] = summarizeSeries(docs);
  assert.equal(row.winRatePct, 9);
  assert.equal(row.avgReturnPct, -2.17); // NOT -217 — this is the exact scaling bug found 2026-08-28
});

test("summarizeSeries: sorts by trades descending", () => {
  const docs = [
    doc({ seriesKey: "1|1d|2", trades: 5, wins: 1, sumReturnPct: -5 }),
    doc({ seriesKey: "2|1d|2", trades: 50, wins: 5, sumReturnPct: -50 }),
  ];
  const rows = summarizeSeries(docs);
  assert.deepEqual(rows.map(r => r.strategyId), ["2", "1"]);
});

test("summarizeSeries: a return exceeding the sanity bound is flagged null, not reported as real", () => {
  // Simulates the actual 2026-08-28 bug output (-217.25) reaching this function directly —
  // it must refuse to print it as a real number rather than propagate it.
  const docs = [doc({ seriesKey: "12|1d|2", trades: 203, wins: 18, sumReturnPct: -44102 })];
  const [row] = summarizeSeries(docs);
  assert.equal(row.avgReturnPct, null);
});

// ── readinessVerdict ─────────────────────────────────────────────────────

test("readinessVerdict: not ready when trade volume is too low", () => {
  const docs = Array.from({ length: 12 }, (_, i) =>
    doc({ seriesKey: `${i + 1}|1d|2`, trades: 15, wins: 1, exitSL: 14, exitTP: 1, exitTIMEOUT: 0 }));
  const v = readinessVerdict({ currentDocs: docs });
  assert.equal(v.ready, false);
  assert.equal(v.gates.tradeVolume, false);
});

test("readinessVerdict: not ready when too concentrated in few strategies", () => {
  const docs = [
    doc({ seriesKey: "1|1d|2", trades: 400, exitTIMEOUT: 5 }),
    doc({ seriesKey: "2|1d|2", trades: 400, exitTIMEOUT: 5 }),
  ];
  const v = readinessVerdict({ currentDocs: docs });
  assert.equal(v.ready, false);
  assert.equal(v.gates.strategyBreadth, false);
});

test("readinessVerdict: not ready while exitTIMEOUT is exactly 0, even with huge volume", () => {
  const docs = Array.from({ length: 16 }, (_, i) =>
    doc({ seriesKey: `${i + 1}|1d|2`, trades: 200, exitSL: 190, exitTP: 10, exitTIMEOUT: 0 }));
  const v = readinessVerdict({ currentDocs: docs });
  assert.equal(v.ready, false);
  assert.equal(v.gates.timeoutMovement, false);
  assert.equal(v.gates.tradeVolume, true);
  assert.equal(v.gates.strategyBreadth, true);
  assert.ok(v.notes.some(n => n.includes("left-censored")));
});

test("readinessVerdict: ready only once all three gates pass", () => {
  const docs = Array.from({ length: 16 }, (_, i) =>
    doc({ seriesKey: `${i + 1}|1d|2`, trades: 25, exitSL: 15, exitTP: 5, exitTIMEOUT: 5 }));
  const v = readinessVerdict({ currentDocs: docs });
  assert.equal(v.totalTrades, 400);
  assert.equal(v.totalExitTIMEOUT, 80);
  assert.equal(v.ready, true);
  assert.deepEqual(v.notes, []);
});

test("readinessVerdict: reflects today's actual 2026-08-28 numbers as NOT READY", () => {
  // Pinned to the real verified output so a future change to the gates is a deliberate edit, not a drift.
  const docs = [
    doc({ seriesKey: "13|1d|2", trades: 20, wins: 0, exitSL: 20, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "12|1d|2", trades: 20, wins: 1, exitSL: 19, exitTP: 1, exitTIMEOUT: 0 }),
    doc({ seriesKey: "10|1d|2", trades: 20, wins: 1, exitSL: 19, exitTP: 1, exitTIMEOUT: 0 }),
    doc({ seriesKey: "1|1d|2", trades: 19, wins: 1, exitSL: 18, exitTP: 1, exitTIMEOUT: 0 }),
    doc({ seriesKey: "2|1d|2", trades: 19, wins: 1, exitSL: 18, exitTP: 1, exitTIMEOUT: 0 }),
    doc({ seriesKey: "4|1d|2", trades: 18, wins: 0, exitSL: 18, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "11|1d|2", trades: 17, wins: 1, exitSL: 16, exitTP: 1, exitTIMEOUT: 0 }),
    doc({ seriesKey: "3|1d|2", trades: 15, wins: 1, exitSL: 14, exitTP: 1, exitTIMEOUT: 0 }),
    doc({ seriesKey: "14|1d|2", trades: 9, wins: 0, exitSL: 9, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "5|1d|2", trades: 9, wins: 0, exitSL: 9, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "15|1d|2", trades: 6, wins: 1, exitSL: 5, exitTP: 1, exitTIMEOUT: 0 }),
    doc({ seriesKey: "6|1d|2", trades: 2, wins: 0, exitSL: 2, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "8|1d|2", trades: 2, wins: 0, exitSL: 2, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "17|1d|2", trades: 2, wins: 0, exitSL: 2, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "16|1d|2", trades: 1, wins: 0, exitSL: 1, exitTP: 0, exitTIMEOUT: 0 }),
    doc({ seriesKey: "7|1d|2", trades: 1, wins: 0, exitSL: 1, exitTP: 0, exitTIMEOUT: 0 }),
  ];
  const v = readinessVerdict({ currentDocs: docs });
  assert.equal(v.totalTrades, 180);
  assert.equal(v.totalExitTIMEOUT, 0);
  assert.equal(v.strategyCount, 16);
  assert.equal(v.ready, false);
  assert.equal(v.gates.strategyBreadth, true); // breadth is fine — it's volume + timeout that fail
  assert.equal(v.gates.tradeVolume, false);
  assert.equal(v.gates.timeoutMovement, false);
});

// ── estimateTimeoutEta ───────────────────────────────────────────────────

test("estimateTimeoutEta: ~mid-September for the 2026-08-20 v2 capture start with 20 hold bars", () => {
  const eta = estimateTimeoutEta(new Date("2026-08-20T00:00:00Z"), 20);
  // 20 trading days ≈ 28 calendar days out → ~2026-09-17
  assert.equal(eta.toISOString().slice(0, 10), "2026-09-17");
});

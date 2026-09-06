import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExit, computeReturnPct, isValidOhlcBar, type ExitBar } from "./exit-detection";

const bar = (high: number, low: number, close: number): ExitBar => ({ high, low, close });

test("checkExit: BUY hits TP on the first bar", () => {
  const r = checkExit([bar(110, 100, 105)], "BUY", 90, 108, 20);
  assert.deepEqual(r, { exitPrice: 108, exitReason: "TP", holdBars: 1 });
});

test("checkExit: BUY hits SL on the first bar", () => {
  const r = checkExit([bar(102, 88, 95)], "BUY", 90, 120, 20);
  assert.deepEqual(r, { exitPrice: 90, exitReason: "SL", holdBars: 1 });
});

test("checkExit: SELL hits TP when price falls", () => {
  const r = checkExit([bar(101, 80, 90)], "SELL", 110, 85, 20);
  assert.deepEqual(r, { exitPrice: 85, exitReason: "TP", holdBars: 1 });
});

test("checkExit: SELL hits SL when price rises", () => {
  const r = checkExit([bar(112, 95, 100)], "SELL", 110, 80, 20);
  assert.deepEqual(r, { exitPrice: 110, exitReason: "SL", holdBars: 1 });
});

test("checkExit: same-bar SL+TP touch — SL wins (conservative tie-break)", () => {
  const r = checkExit([bar(120, 85, 100)], "BUY", 90, 110, 20);
  assert.equal(r?.exitReason, "SL");
  assert.equal(r?.exitPrice, 90);
});

test("checkExit: hit lands on a later bar, holdBars reflects the index", () => {
  const bars = [bar(100, 95, 98), bar(101, 96, 99), bar(112, 97, 108)];
  const r = checkExit(bars, "BUY", 90, 110, 20);
  assert.deepEqual(r, { exitPrice: 110, exitReason: "TP", holdBars: 3 });
});

test("checkExit: exact touch at the barrier counts as a hit", () => {
  const r = checkExit([bar(110, 100, 105)], "BUY", 90, 110, 20);
  assert.equal(r?.exitReason, "TP");
});

test("checkExit: no hit within maxHoldBars — TIMEOUT at last close", () => {
  const bars = Array.from({ length: 20 }, () => bar(105, 95, 100));
  const r = checkExit(bars, "BUY", 90, 110, 20);
  assert.deepEqual(r, { exitPrice: 100, exitReason: "TIMEOUT", holdBars: 20 });
});

test("checkExit: fewer bars than maxHoldBars, no hit — undetermined (null)", () => {
  const bars = Array.from({ length: 5 }, () => bar(105, 95, 100));
  const r = checkExit(bars, "BUY", 90, 110, 20);
  assert.equal(r, null);
});

test("checkExit: zero bars supplied — undetermined (null)", () => {
  assert.equal(checkExit([], "BUY", 90, 110, 20), null);
});

test("checkExit: extra bars past maxHoldBars are never consulted", () => {
  const bars = [
    ...Array.from({ length: 20 }, () => bar(105, 95, 100)), // no hit, exhausts maxHoldBars
    bar(200, 199, 199.5), // would be a huge TP hit if looked at — must be ignored
  ];
  const r = checkExit(bars, "BUY", 90, 110, 20);
  assert.equal(r?.exitReason, "TIMEOUT");
  assert.equal(r?.holdBars, 20);
});

// ── computeReturnPct ────────────────────────────────────────────────────────
// Regression guard for the exact bug class found 2026-08-28: sumReturnPct is
// stored in percent units already, and a stray extra *100 anywhere turns a
// sane -2.3% into a nonsensical -230%. These assertions pin the magnitude.

test("computeReturnPct: BUY win is a small positive percent, not a fraction or x100", () => {
  assert.equal(computeReturnPct("BUY", 100, 105.74), 5.74);
});

test("computeReturnPct: BUY loss is a small negative percent", () => {
  assert.equal(computeReturnPct("BUY", 100, 97.7), -2.3);
});

test("computeReturnPct: SELL win when price falls", () => {
  assert.equal(computeReturnPct("SELL", 100, 94.26), 5.74);
});

test("computeReturnPct: SELL loss when price rises", () => {
  assert.equal(computeReturnPct("SELL", 100, 102.3), -2.3);
});

test("computeReturnPct: realistic SL/TP geometry never produces a return >20% in magnitude", () => {
  // SL ~2.3%, TP ~5.74% per the project's documented geometry — even a wildly
  // gapped exit shouldn't approach the old bug's -217%/-405% readings.
  const r = computeReturnPct("BUY", 100, 90);
  assert.ok(Math.abs(r) < 20, `expected a bounded return, got ${r}`);
});

// ── isValidOhlcBar ──────────────────────────────────────────────────────────

test("isValidOhlcBar: accepts a normal healthy bar", () => {
  assert.equal(isValidOhlcBar(bar(110, 100, 105)), true);
});

test("isValidOhlcBar: accepts close exactly at high or low", () => {
  assert.equal(isValidOhlcBar(bar(110, 100, 110)), true);
  assert.equal(isValidOhlcBar(bar(110, 100, 100)), true);
});

test("isValidOhlcBar: rejects the observed CT=F corruption (close above high)", () => {
  assert.equal(isValidOhlcBar({ high: 83.38, low: 82.70, close: 88.59 }), false);
});

test("isValidOhlcBar: rejects close below low", () => {
  assert.equal(isValidOhlcBar(bar(110, 100, 95)), false);
});

test("isValidOhlcBar: accepts the degenerate high === low case when close matches", () => {
  assert.equal(isValidOhlcBar(bar(100, 100, 100)), true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  curveTransitionCopy,
  isExtremeSentiment,
  trillionFloor,
  extremeMovers,
  EXTREME_MOVE_THRESHOLD,
  type MoveRow,
} from "./macro-notifiers";
import { curveStatusOf } from "../routes/economy";

// ── curve status (shared with /api/bonds) ────────────────────────────────────

test("curveStatusOf: buckets at the documented ±0.2 thresholds", () => {
  assert.equal(curveStatusOf(-0.5), "inverted");
  assert.equal(curveStatusOf(-0.21), "inverted");
  assert.equal(curveStatusOf(-0.2), "flat"); // boundary is inclusive on the flat side
  assert.equal(curveStatusOf(0), "flat");
  assert.equal(curveStatusOf(0.2), "flat");
  assert.equal(curveStatusOf(0.21), "normal");
  assert.equal(curveStatusOf(1.5), "normal");
});

test("curveStatusOf: null spread yields no label rather than a wrong one", () => {
  assert.equal(curveStatusOf(null), null);
});

test("curveTransitionCopy: leaving inversion is framed as re-steepening, not a generic shift", () => {
  const c = curveTransitionCopy("inverted", "normal");
  assert.match(c.title, /re-steepened/i);
  assert.match(c.body, /recession/i);
});

test("curveTransitionCopy: entering inversion is framed as inverting", () => {
  const c = curveTransitionCopy("normal", "inverted");
  assert.match(c.title, /inverted/i);
});

test("curveTransitionCopy: an unremarkable flat<->normal move gets neutral copy", () => {
  const c = curveTransitionCopy("flat", "normal");
  assert.doesNotMatch(c.title, /re-steepened|inverted/i);
});

// ── fear & greed ─────────────────────────────────────────────────────────────

test("isExtremeSentiment: only the two outer bands count", () => {
  assert.equal(isExtremeSentiment("Extreme Fear"), true);
  assert.equal(isExtremeSentiment("Extreme Greed"), true);
  assert.equal(isExtremeSentiment("Fear"), false);
  assert.equal(isExtremeSentiment("Greed"), false);
  assert.equal(isExtremeSentiment("Neutral"), false);
  assert.equal(isExtremeSentiment(undefined), false);
});

// ── debt milestone ───────────────────────────────────────────────────────────

test("trillionFloor: floors to the trillion below, never rounds up", () => {
  assert.equal(trillionFloor(38_900_000_000_000), 38);
  assert.equal(trillionFloor(39_000_000_000_000), 39);
  assert.equal(trillionFloor(39_999_999_999_999), 39);
});

test("trillionFloor: a crossing changes the state, a normal daily rise does not", () => {
  const before = trillionFloor(38_999_000_000_000);
  const sameDayLater = trillionFloor(38_999_500_000_000);
  const afterCrossing = trillionFloor(39_000_100_000_000);
  assert.equal(before, sameDayLater); // no spurious notification
  assert.notEqual(before, afterCrossing);
});

// ── extreme move ─────────────────────────────────────────────────────────────

const row = (name: string, changePercent: number): MoveRow => ({ name, flag: "🏳️", changePercent });

test("extremeMovers: filters at the threshold and ranks by absolute size", () => {
  const movers = extremeMovers([
    row("S&P 500", -1.2),
    row("Nikkei 225", -4.2),
    row("Gold", 3.1),
    row("DAX 40", 0.4),
  ]);
  assert.deepEqual(movers.map((m) => m.name), ["Nikkei 225", "Gold"]);
});

test("extremeMovers: a big drop and a big rally both qualify", () => {
  const movers = extremeMovers([row("Crude Oil", -5.5), row("Bitcoin", 6.2)]);
  assert.equal(movers.length, 2);
  assert.equal(movers[0].name, "Bitcoin"); // 6.2 > 5.5 in absolute terms
});

test("extremeMovers: exactly at the threshold counts as extreme", () => {
  const movers = extremeMovers([row("Silver", EXTREME_MOVE_THRESHOLD)]);
  assert.equal(movers.length, 1);
});

test("extremeMovers: a calm day produces nothing", () => {
  assert.deepEqual(extremeMovers([row("S&P 500", 0.6), row("Gold", -1.9)]), []);
});

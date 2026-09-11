import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sentimentSide,
  isPositioningFlip,
  encodeCotState,
  decodeCotState,
  encodeQuadrantState,
  decodeQuadrantState,
  notableQuadrantMoves,
} from "./positioning-notifiers";

// ── COT positioning ──────────────────────────────────────────────────────────

test("sentimentSide: maps both intensities to the same side, Neutral to neither", () => {
  assert.equal(sentimentSide("Strongly Bullish"), "bull");
  assert.equal(sentimentSide("Bullish"), "bull");
  assert.equal(sentimentSide("Bearish"), "bear");
  assert.equal(sentimentSide("Strongly Bearish"), "bear");
  assert.equal(sentimentSide("Neutral"), null);
  assert.equal(sentimentSide(undefined), null);
});

test("isPositioningFlip: a bull->bear cross is a flip", () => {
  assert.equal(isPositioningFlip("Bullish", "Bearish"), true);
  assert.equal(isPositioningFlip("Strongly Bearish", "Bullish"), true);
});

test("isPositioningFlip: intensifying within the same side is NOT a flip", () => {
  assert.equal(isPositioningFlip("Bullish", "Strongly Bullish"), false);
  assert.equal(isPositioningFlip("Strongly Bearish", "Bearish"), false);
});

test("isPositioningFlip: passing through Neutral is not itself a flip", () => {
  assert.equal(isPositioningFlip("Bullish", "Neutral"), false);
  assert.equal(isPositioningFlip("Neutral", "Bearish"), false);
});

test("encodeCotState/decodeCotState: round-trips and is order-independent", () => {
  const a = encodeCotState([
    { name: "Gold", sentiment: "Bullish" },
    { name: "Crude Oil", sentiment: "Bearish" },
  ]);
  const b = encodeCotState([
    { name: "Crude Oil", sentiment: "Bearish" },
    { name: "Gold", sentiment: "Bullish" },
  ]);
  assert.equal(a, b, "state must not change just because the rows arrived in a different order");
  const decoded = decodeCotState(a);
  assert.equal(decoded.get("Gold"), "Bullish");
  assert.equal(decoded.get("Crude Oil"), "Bearish");
});

test("encodeCotState: a missing sentiment still round-trips without corrupting neighbours", () => {
  const state = encodeCotState([
    { name: "Gold", sentiment: undefined },
    { name: "Silver", sentiment: "Bullish" },
  ]);
  const decoded = decodeCotState(state);
  assert.equal(decoded.get("Gold"), "?");
  assert.equal(decoded.get("Silver"), "Bullish");
});

// ── Sector rotation ──────────────────────────────────────────────────────────

test("notableQuadrantMoves: entering Leading or Lagging is notable", () => {
  const prev = decodeQuadrantState(
    encodeQuadrantState([
      { name: "Energy", quadrant: "Improving" },
      { name: "Tech", quadrant: "Leading" },
    ]),
  );
  const next = decodeQuadrantState(
    encodeQuadrantState([
      { name: "Energy", quadrant: "Leading" },
      { name: "Tech", quadrant: "Leading" },
    ]),
  );
  const moves = notableQuadrantMoves(prev, next);
  assert.deepEqual(moves, [{ name: "Energy", from: "Improving", to: "Leading" }]);
});

test("notableQuadrantMoves: the noisy middle transitions are ignored", () => {
  const prev = decodeQuadrantState(encodeQuadrantState([{ name: "Utilities", quadrant: "Lagging" }]));
  const next = decodeQuadrantState(encodeQuadrantState([{ name: "Utilities", quadrant: "Improving" }]));
  assert.deepEqual(notableQuadrantMoves(prev, next), []);
});

test("notableQuadrantMoves: an unchanged quadrant is never reported", () => {
  const state = decodeQuadrantState(encodeQuadrantState([{ name: "Financials", quadrant: "Leading" }]));
  assert.deepEqual(notableQuadrantMoves(state, state), []);
});

test("notableQuadrantMoves: a newly-appearing sector doesn't fire (no prior state to cross from)", () => {
  const prev = decodeQuadrantState(encodeQuadrantState([{ name: "Energy", quadrant: "Leading" }]));
  const next = decodeQuadrantState(
    encodeQuadrantState([
      { name: "Energy", quadrant: "Leading" },
      { name: "Real Estate", quadrant: "Lagging" },
    ]),
  );
  assert.deepEqual(notableQuadrantMoves(prev, next), []);
});

test("notableQuadrantMoves: several sectors rotating at once are all returned", () => {
  const prev = decodeQuadrantState(
    encodeQuadrantState([
      { name: "Energy", quadrant: "Improving" },
      { name: "Tech", quadrant: "Weakening" },
    ]),
  );
  const next = decodeQuadrantState(
    encodeQuadrantState([
      { name: "Energy", quadrant: "Leading" },
      { name: "Tech", quadrant: "Lagging" },
    ]),
  );
  assert.equal(notableQuadrantMoves(prev, next).length, 2);
});

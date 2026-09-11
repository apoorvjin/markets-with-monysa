import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAction } from "./broadcast-notifier";

test("decideAction: unchanged state is a no-op", () => {
  assert.equal(decideAction("contango", "contango", 0, 1_000, 0), "noop");
});

test("decideAction: state change with no cooldown notifies", () => {
  assert.equal(decideAction("contango", "backwardation", 0, 1_000, 0), "notify");
});

test("decideAction: state change within the cooldown window is suppressed", () => {
  assert.equal(decideAction("contango", "backwardation", 1_000, 1_500, 60_000), "suppress");
});

test("decideAction: state change after the cooldown elapses notifies", () => {
  assert.equal(decideAction("contango", "backwardation", 1_000, 62_000, 60_000), "notify");
});

test("decideAction: exact cooldown boundary counts as elapsed, not within window", () => {
  assert.equal(decideAction("contango", "backwardation", 1_000, 61_000, 60_000), "notify");
});

test("decideAction: one ms before the cooldown boundary is still suppressed", () => {
  assert.equal(decideAction("contango", "backwardation", 1_000, 60_999, 60_000), "suppress");
});

test("decideAction: zero cooldown never suppresses", () => {
  assert.equal(decideAction("contango", "flat", 1_000, 1_001, 0), "notify");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeTariffState, newestCountry, flagOf } from "./tariff-notifier";
import type { OverlayCountry } from "../routes/tariff-refresh";

const country = (code: string, name: string, effectiveDate: string): OverlayCountry => ({
  countryCode: code,
  countryName: name,
  tariffRate: 20,
  effectiveDate,
  sourceURL: "https://example.gov/doc",
  sourceDocumentNumber: `2026-${code}`,
});

test("encodeTariffState: a new document changes the state", () => {
  const before = encodeTariffState(["2026-001", "2026-002"]);
  const after = encodeTariffState(["2026-001", "2026-002", "2026-003"]);
  assert.notEqual(before, after);
});

test("encodeTariffState: the same documents in a different order do NOT change the state", () => {
  const a = encodeTariffState(["2026-002", "2026-001"]);
  const b = encodeTariffState(["2026-001", "2026-002"]);
  assert.equal(a, b, "a re-poll that returns docs in another order must not fire a push");
});

test("encodeTariffState: the count leads, so shouldNotify can compare growth", () => {
  assert.match(encodeTariffState(["a", "b", "c"]), /^3:/);
});

test("encodeTariffState: an empty set is still encodable", () => {
  assert.equal(encodeTariffState([]), "0:none");
});

test("newestCountry: picks the latest effective date, not insertion order", () => {
  const lead = newestCountry({
    VN: country("VN", "Vietnam", "2026-10-01"),
    BR: country("BR", "Brazil", "2026-08-15"),
    IN: country("IN", "India", "2026-09-20"),
  });
  assert.equal(lead?.countryName, "Vietnam");
});

test("newestCountry: an empty overlay yields null rather than throwing", () => {
  assert.equal(newestCountry({}), null);
});

test("flagOf: builds a regional-indicator flag from an ISO code", () => {
  assert.equal(flagOf("VN"), "🇻🇳");
  assert.equal(flagOf("us"), "🇺🇸"); // case-insensitive
});

test("flagOf: a malformed code falls back to a globe instead of emitting garbage", () => {
  assert.equal(flagOf("XYZ"), "🌐");
  assert.equal(flagOf(""), "🌐");
});

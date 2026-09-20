import assert from "node:assert/strict";
import test from "node:test";
import { accountDate, parseAccountAmount } from "./accounts";

test("ledger amounts retain exact cents and reject ambiguous input", () => {
  assert.equal(parseAccountAmount("60"), 6000);
  assert.equal(parseAccountAmount("0.29"), 29);
  assert.equal(parseAccountAmount("10.1"), 1010);
  assert.equal(parseAccountAmount("100000000"), 10_000_000_000);
  assert.throws(() => parseAccountAmount("100000000.01"));
  for (const value of [
    "0",
    "-1",
    "1.005",
    "1e2",
    "1,000",
    "Infinity",
    "9007199254740992",
  ]) {
    assert.throws(() => parseAccountAmount(value));
  }
});

test("effective dates use UTC calendar days and reject overflow dates", () => {
  assert.equal(accountDate("2024-02-29"), Date.UTC(2024, 1, 29));
  assert.throws(() => accountDate("2025-02-29"));
  assert.throws(() => accountDate("2026-13-01"));
  assert.throws(() => accountDate(""));
});

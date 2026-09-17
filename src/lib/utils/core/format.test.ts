import assert from "node:assert/strict";
import test from "node:test";
import { abbreviatePlayerName } from "./format";

void test("compact player names preserve surnames and punctuation", () => {
  assert.equal(abbreviatePlayerName("Sidney Crosby"), "S. Crosby");
  assert.equal(abbreviatePlayerName("James van Riemsdyk"), "J. van Riemsdyk");
  assert.equal(abbreviatePlayerName("Jean-Gabriel Pageau"), "J. Pageau");
  assert.equal(abbreviatePlayerName("Ryan O'Reilly"), "R. O'Reilly");
  assert.equal(abbreviatePlayerName("Émile Poirier"), "É. Poirier");
});

void test("compact player names handle whitespace and missing name parts", () => {
  assert.equal(abbreviatePlayerName("  Sidney   Crosby  "), "S. Crosby");
  assert.equal(abbreviatePlayerName("Crosby"), "Crosby");
  assert.equal(abbreviatePlayerName(""), "");
  assert.equal(abbreviatePlayerName("   "), "");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  ranks,
  correlation,
  spearman,
  compareRanks,
  parseCsv,
} from "./nhl-rating-diagnostics";

void test("rank correlations handle ties, inversion and degenerate pools", () => {
  assert.deepEqual(ranks([5, 1, 5, 3]), [1.5, 4, 1.5, 3]);
  assert.equal(spearman([1, 3, 2], [100, 300, 200]), 1);
  assert.equal(spearman([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(correlation([1, 1], [2, 3]), null);
  assert.equal(spearman([1, NaN], [2, 3]), null);
  assert.throws(() => correlation([1], [1, 2]));
  assert.equal(compareRanks([1, 2, 3], [3, 2, 1]).maximumShift, 2);
});
void test("CSV diagnostic inputs retain quoted commas, escaped quotes and multiline cells", () => {
  assert.deepEqual(
    parseCsv('id,name\r\n1,"A, B"\r\n2,"C ""D"""\r\n3,"E\nF"\r\n'),
    [
      { id: "1", name: "A, B" },
      { id: "2", name: 'C "D"' },
      { id: "3", name: "E\nF" },
    ],
  );
  assert.throws(() => parseCsv('id,name\n1,"bad'));
  assert.throws(() => parseCsv("id,name\n1"));
});

import assert from "node:assert/strict";
import test from "node:test";
import { alignRowsToColumns, planCompositeKeyUpsert } from "./index";

test("aligns reordered headers with strict coercion", () => {
  assert.deepEqual(
    alignRowsToColumns({
      rawRows: [
        ["Name", "ID"],
        ["Ada", 7],
      ],
      columns: ["id", "name"],
    }),
    [[7, "Ada"]],
  );
});

test("plans reconciliation without performing writes", () => {
  const plan = planCompositeKeyUpsert({
    headerColumns: ["id", "date", "value"],
    existingRows: [
      ["1", "2026-01-01", "old"],
      ["2", "2026-01-02", "gone"],
    ],
    incomingRows: [
      { date: "2026-01-01", value: "new" },
      { date: "2026-01-03", value: "add" },
    ],
    keyColumns: ["date"],
    merge: true,
    idColumn: "id",
    nowIso: "2026-01-04",
    deleteMissing: true,
    normalizeValue: ({ value }) => String(value ?? ""),
    normalizeKeyPart: ({ value }) => String(value ?? "").trim(),
  });
  assert.equal(plan.updated, 1);
  assert.equal(plan.inserted, 1);
  assert.equal(plan.unchanged, 0);
  assert.deepEqual(plan.rowNumbersToDelete, [3]);
  assert.deepEqual(plan.inserts, [["3", "2026-01-03", "add"]]);
});

test("keeps adapter-owned deletion and duplicate policies in the plan", () => {
  const plan = planCompositeKeyUpsert({
    headerColumns: ["id", "seasonId", "value"],
    existingRows: [
      ["1", "2026", "older duplicate"],
      ["2", "2026", "current duplicate"],
      ["3", "2025", "other season"],
    ],
    incomingRows: [{ seasonId: "2026", value: "replacement" }],
    keyColumns: ["seasonId"],
    merge: true,
    idColumn: "id",
    nowIso: "2026-01-04",
    deleteMissing: true,
    deleteFilter: { seasonId: "2026" },
    normalizeValue: ({ value }) => String(value ?? ""),
    normalizeKeyPart: ({ value }) => String(value ?? "").trim(),
  });
  assert.deepEqual(plan.duplicateRowNumbers, [2]);
  assert.deepEqual(plan.rowNumbersToDelete, []);
  assert.equal(plan.updated, 1);
});

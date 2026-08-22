import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseReader } from "../_generated/server";
import { loadDueUfaOfferGroups } from "./ufaReconciliation";

type OfferGroupRow = {
  _id: string;
  status: "open" | "failed" | "resolving" | "resolved";
  deadlineAt: number;
};

type QueryRead = {
  index: string;
  status: string | undefined;
  deadlineAt: number | undefined;
  limit: number;
};

function createStrictFakeDb(rows: OfferGroupRow[]) {
  const reads: QueryRead[] = [];
  const db = {
    query(table: string) {
      assert.equal(table, "ufaOfferGroups");
      return {
        collect() {
          throw new Error("Unbounded UFA offer-group collection");
        },
        withIndex(
          index: string,
          applyRange: (range: {
            eq: (field: string, value: string) => unknown;
            lte: (field: string, value: number) => unknown;
          }) => unknown,
        ) {
          let status: string | undefined;
          let deadlineAt: number | undefined;
          const range = {
            eq(field: string, value: string) {
              assert.equal(field, "status");
              status = value;
              return range;
            },
            lte(field: string, value: number) {
              assert.equal(field, "deadlineAt");
              deadlineAt = value;
              return range;
            },
          };
          applyRange(range);
          return {
            async take(limit: number) {
              reads.push({ index, status, deadlineAt, limit });
              return rows
                .filter(
                  (row) =>
                    row.status === status &&
                    deadlineAt !== undefined &&
                    row.deadlineAt <= deadlineAt,
                )
                .sort((left, right) => left.deadlineAt - right.deadlineAt)
                .slice(0, limit);
            },
          };
        },
      };
    },
  };
  return { db, reads };
}

void test("loads a bounded oldest-first batch of due UFA groups by index", async () => {
  const statuses = ["open", "failed", "resolving"] as const;
  const fake = createStrictFakeDb(
    Array.from({ length: 60 }, (_, index) => ({
      _id: `group-${index + 1}`,
      status: statuses[index % statuses.length]!,
      deadlineAt: index + 1,
    })),
  );

  const due = await loadDueUfaOfferGroups(
    fake.db as unknown as DatabaseReader,
    100,
  );

  assert.equal(due.length, 50);
  assert.deepEqual(
    due.map((group) => group.deadlineAt),
    Array.from({ length: 50 }, (_, index) => index + 1),
  );
  assert.deepEqual(fake.reads, [
    {
      index: "by_status_deadline",
      status: "open",
      deadlineAt: 100,
      limit: 50,
    },
    {
      index: "by_status_deadline",
      status: "failed",
      deadlineAt: 100,
      limit: 50,
    },
    {
      index: "by_status_deadline",
      status: "resolving",
      deadlineAt: 100,
      limit: 50,
    },
  ]);
});

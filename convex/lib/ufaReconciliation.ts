import type { DatabaseReader } from "../_generated/server";

const RECONCILABLE_STATUSES = ["open", "failed", "resolving"] as const;
const RECONCILIATION_BATCH_SIZE = 50;

export async function loadDueUfaOfferGroups(db: DatabaseReader, now: number) {
  const groups = (
    await Promise.all(
      RECONCILABLE_STATUSES.map((status) =>
        db
          .query("ufaOfferGroups")
          .withIndex("by_status_deadline", (range) =>
            range.eq("status", status).lte("deadlineAt", now),
          )
          .take(RECONCILIATION_BATCH_SIZE),
      ),
    )
  ).flat();

  return groups
    .sort(
      (left, right) =>
        left.deadlineAt - right.deadlineAt ||
        String(left._id).localeCompare(String(right._id)),
    )
    .slice(0, RECONCILIATION_BATCH_SIZE);
}

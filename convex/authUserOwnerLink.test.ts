import assert from "node:assert/strict";
import { test } from "node:test";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { validateAuthUserOwnerLink } from "./lib/authUserOwnerLink";

const userId = "user" as Id<"authUsers">;
const ownerId = "owner" as Id<"owners">;

function fixture(isActive: boolean | null, linkedIds: string[] = []) {
  const owner = isActive === null ? null : { _id: ownerId, isActive };
  const ctx = {
    db: {
      get: async (id: string) => {
        assert.equal(id, ownerId);
        return owner;
      },
      query: (table: string) => {
        assert.equal(table, "authUsers");
        return {
          withIndex: (
            name: string,
            filter: (range: {
              eq: (field: string, value: string) => void;
            }) => unknown,
          ) => {
            assert.equal(name, "by_ownerId");
            filter({
              eq: (field, value) => {
                assert.equal(field, "ownerId");
                assert.equal(value, ownerId);
              },
            });
            return {
              take: async (count: number) =>
                linkedIds.slice(0, count).map((_id) => ({ _id })),
            };
          },
        };
      },
    },
  } as unknown as Pick<MutationCtx, "db">;
  return { ctx, owner };
}

void test("active and inactive owners can be linked without changing league status", async () => {
  for (const active of [true, false]) {
    for (const role of ["owner", "commissioner"] as const) {
      const { ctx, owner } = fixture(active);
      assert.equal(
        await validateAuthUserOwnerLink(ctx, userId, role, ownerId),
        ownerId,
      );
      assert.equal(owner?.isActive, active);
    }
  }
});

void test("an existing inactive owner link can be saved again", async () => {
  const { ctx } = fixture(false, [userId]);
  assert.equal(
    await validateAuthUserOwnerLink(ctx, userId, "owner", ownerId),
    ownerId,
  );
});

void test("another account cannot claim an already linked owner", async () => {
  for (const linked of [["other"], [userId, "other"]]) {
    const { ctx } = fixture(false, linked);
    await assert.rejects(
      validateAuthUserOwnerLink(ctx, userId, "owner", ownerId),
      /already linked/,
    );
  }
});

void test("owner links must refer to an existing record", async () => {
  const { ctx } = fixture(null);
  await assert.rejects(
    validateAuthUserOwnerLink(ctx, userId, "owner", ownerId),
    /existing owner/,
  );
});

void test("owners require a link while commissioners may omit it", async () => {
  const { ctx } = fixture(null);
  await assert.rejects(
    validateAuthUserOwnerLink(ctx, userId, "owner"),
    /must be linked/,
  );
  assert.equal(
    await validateAuthUserOwnerLink(ctx, userId, "commissioner"),
    undefined,
  );
});

void test("switching to viewer clears the owner link", async () => {
  const { ctx } = fixture(false);
  assert.equal(
    await validateAuthUserOwnerLink(ctx, userId, "viewer", ownerId),
    undefined,
  );
});

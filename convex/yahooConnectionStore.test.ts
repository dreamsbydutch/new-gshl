import assert from "node:assert/strict";
import { test } from "node:test";
import type { RegisteredMutation, DefaultFunctionArgs } from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  acquire,
  begin,
  claimTicket,
  consumeState,
  disconnect,
  release,
  save,
} from "./yahooConnectionStore";

// Convex exposes the handler at runtime but strips its internal type from d.ts.
function handler<A extends DefaultFunctionArgs, R>(
  fn: RegisteredMutation<"internal", A, R>,
) {
  return (fn as unknown as { _handler: (ctx: MutationCtx, args: A) => R })
    ._handler;
}

function fixture() {
  let row: (Partial<Doc<"yahooConnections">> & { generation: number }) | null =
    null;
  // Only the database operations exercised by this singleton store are mocked.
  const ctx = {
    db: {
      query: () => ({
        withIndex: () => ({ unique: async () => (row ? { ...row } : null) }),
      }),
      insert: async (_table: string, value: NonNullable<typeof row>) => {
        row = { ...value };
      },
      patch: async (_id: unknown, value: Partial<NonNullable<typeof row>>) => {
        if (!row) throw new Error("missing row");
        row = { ...row, ...value };
      },
      delete: async () => {
        row = null;
      },
    },
  } as unknown as MutationCtx;
  return {
    ctx,
    read: () => row,
    expire: () => {
      if (row) row.pendingUntil = 0;
    },
    expireLease: () => {
      if (row) row.leaseUntil = 0;
    },
  };
}

async function claim(ctx: MutationCtx) {
  await handler(begin)(ctx, { ticketHash: "ticket" });
  assert.equal(
    await handler(claimTicket)(ctx, {
      ticketHash: "ticket",
      stateHash: "state",
      browserHash: "browser",
    }),
    true,
  );
}

void test("ticket is one-use and callback requires both state and the same browser", async () => {
  const { ctx } = fixture();
  await claim(ctx);
  assert.equal(
    await handler(claimTicket)(ctx, {
      ticketHash: "ticket",
      stateHash: "other",
      browserHash: "other",
    }),
    false,
  );
  assert.equal(
    await handler(consumeState)(ctx, {
      stateHash: "state",
      browserHash: "attacker",
      lease: "lease",
    }),
    null,
  );
  assert.equal(
    await handler(consumeState)(ctx, {
      stateHash: "attacker",
      browserHash: "browser",
      lease: "lease",
    }),
    null,
  );
  assert.equal(
    await handler(consumeState)(ctx, {
      stateHash: "state",
      browserHash: "browser",
      lease: "lease",
    }),
    1,
  );
  assert.equal(
    await handler(consumeState)(ctx, {
      stateHash: "state",
      browserHash: "browser",
      lease: "lease",
    }),
    null,
  );
});

void test("expired links and callbacks fail; a new attempt invalidates the old ticket", async () => {
  const { ctx, expire } = fixture();
  await handler(begin)(ctx, { ticketHash: "old" });
  await handler(begin)(ctx, { ticketHash: "ticket" });
  assert.equal(
    await handler(claimTicket)(ctx, {
      ticketHash: "old",
      stateHash: "state",
      browserHash: "browser",
    }),
    false,
  );
  expire();
  assert.equal(
    await handler(claimTicket)(ctx, {
      ticketHash: "ticket",
      stateHash: "state",
      browserHash: "browser",
    }),
    false,
  );
  await claim(ctx);
  expire();
  assert.equal(
    await handler(consumeState)(ctx, {
      stateHash: "state",
      browserHash: "browser",
      lease: "lease",
    }),
    null,
  );
});

void test("refresh lease rejects overlap, stale writes, and release by another caller", async () => {
  const { ctx, read, expireLease } = fixture();
  await claim(ctx);
  await handler(consumeState)(ctx, {
    stateHash: "state",
    browserHash: "browser",
    lease: "callback",
  });
  await handler(save)(ctx, {
    lease: "callback",
    generation: 1,
    encryptedTokens: "ciphertext",
  });
  await assert.rejects(handler(acquire)(ctx, { lease: "second" }), /busy/);
  await assert.rejects(handler(begin)(ctx, { ticketHash: "new" }), /busy/);
  await handler(release)(ctx, { lease: "wrong" });
  assert.equal(read()?.lease, "callback");
  await handler(release)(ctx, { lease: "callback" });
  assert.deepEqual(await handler(acquire)(ctx, { lease: "refresh" }), {
    encryptedTokens: "ciphertext",
    generation: 1,
  });
  await assert.rejects(
    handler(save)(ctx, {
      lease: "callback",
      generation: 1,
      encryptedTokens: "stale",
    }),
    /changed/,
  );
  await assert.rejects(
    handler(save)(ctx, {
      lease: "refresh",
      generation: 2,
      encryptedTokens: "stale",
    }),
    /changed/,
  );
  expireLease();
  await assert.rejects(
    handler(save)(ctx, {
      lease: "refresh",
      generation: 1,
      encryptedTokens: "stale",
    }),
    /changed/,
  );
  assert.equal(read()?.encryptedTokens, "ciphertext");
});

void test("disconnect removes pending state and prevents an in-flight write from restoring tokens", async () => {
  const { ctx, read } = fixture();
  await claim(ctx);
  await handler(consumeState)(ctx, {
    stateHash: "state",
    browserHash: "browser",
    lease: "callback",
  });
  await handler(disconnect)(ctx, {});
  await assert.rejects(
    handler(save)(ctx, {
      lease: "callback",
      generation: 1,
      encryptedTokens: "stale",
    }),
    /changed/,
  );
  await assert.rejects(
    handler(acquire)(ctx, { lease: "lease" }),
    /not connected/,
  );
  assert.equal(read(), null);
});

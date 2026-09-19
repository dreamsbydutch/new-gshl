import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DefaultFunctionArgs,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  announce,
  settings,
  enableDraftReminders,
  testPush,
  delivery,
  fanOut,
  markRead,
  removeDevice,
  savePreference,
  subscribe,
} from "./notifications";
import { notifyState } from "./draft";
import {
  isAllowedPushEndpoint,
  notificationChoice,
  NOTIFICATION_OPTIONS,
} from "../src/lib/utils/features/notifications";

function handler<A extends DefaultFunctionArgs>(
  fn:
    | RegisteredMutation<"internal" | "public", A, unknown>
    | RegisteredQuery<"internal" | "public", A, unknown>,
) {
  return (
    fn as unknown as {
      _handler: (ctx: MutationCtx, args: A) => Promise<unknown>;
    }
  )._handler;
}

// Exercises real handlers against the indexed reads/writes they request.
function fixture() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const scheduled: unknown[] = [];
  let subject: string | null = "user";
  function rows(table: string) {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table)!;
  }
  function put(table: string, id: string, value: Record<string, unknown>) {
    rows(table).set(id, { _id: id, _creationTime: Date.now(), ...value });
  }
  function get(id: string) {
    for (const table of tables.values())
      if (table.has(id)) return table.get(id)!;
    return null;
  }
  put("authUsers", "user", {
    status: "active",
    role: "owner",
    ownerId: "owner",
    createdAt: 1,
  });
  const ctx = {
    auth: { getUserIdentity: async () => (subject ? { subject } : null) },
    db: {
      get: async (id: string) => get(id),
      query: (table: string) => {
        const conditions: [string, unknown][] = [];
        const range = {
          eq: (key: string, value: unknown) => {
            conditions.push([key, value]);
            return range;
          },
        };
        const selected = () =>
          [...rows(table).values()].filter((row) =>
            conditions.every(([key, value]) => row[key] === value),
          );
        const query = {
          withIndex: (_name: string, filter: (q: typeof range) => unknown) => {
            filter(range);
            return query;
          },
          unique: async () => {
            assert.ok(selected().length <= 1);
            return selected()[0] ?? null;
          },
          collect: async () => selected(),
          take: async (limit: number) => selected().slice(0, limit),
          paginate: async () => ({
            page: selected(),
            isDone: true,
            continueCursor: "",
          }),
        };
        return query;
      },
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}:${rows(table).size}`;
        put(table, id, value);
        return id;
      },
      patch: async (id: string, value: Record<string, unknown>) => {
        const row = get(id);
        assert.ok(row);
        Object.assign(row, value);
      },
      delete: async (id: string) => {
        for (const table of tables.values()) table.delete(id);
      },
    },
    scheduler: {
      runAfter: async (...args: unknown[]) => scheduled.push(args),
      runAt: async (...args: unknown[]) => scheduled.push(args),
    },
  } as unknown as MutationCtx;
  return {
    ctx,
    put,
    get,
    rows,
    scheduled,
    signIn: (id: string | null) => {
      subject = id;
    },
  };
}

const userId = "user" as Id<"authUsers">;
const eventId = "event" as Id<"notificationEvents">;
const deviceId = "device" as Id<"pushSubscriptions">;
const notificationId = "notification" as Id<"notifications">;

for (const role of ["viewer", "owner", "commissioner"] as const) {
  void test(`announcement access for ${role}`, async () => {
    const f = fixture();
    await f.ctx.db.patch(userId, { role });
    const result = await handler(settings)(f.ctx, {});
    assert.equal(
      (result as { isCommissioner: boolean }).isCommissioner,
      role === "commissioner",
    );
    const send = () =>
      handler(announce)(f.ctx, {
        title: "Draft update",
        body: "The draft starts soon.",
      });
    if (role === "commissioner") {
      await send();
      assert.equal(f.rows("notificationEvents").size, 1);
      assert.equal(f.scheduled.length, 1);
    } else {
      await assert.rejects(send, /Forbidden/);
      assert.equal(f.rows("notificationEvents").size, 0);
      assert.equal(f.scheduled.length, 0);
    }
  });
}

void test("draft setup enables four reminders without changing other choices", async () => {
  const f = fixture();
  await handler(savePreference)(f.ctx, {
    category: "press_box",
    inbox: false,
    push: false,
  });
  await handler(savePreference)(f.ctx, {
    category: "draft_turn",
    inbox: false,
    push: false,
  });
  await handler(enableDraftReminders)(f.ctx, {});
  await handler(enableDraftReminders)(f.ctx, {});
  const preferences = [...f.rows("notificationPreferences").values()];
  assert.equal(preferences.length, 5);
  assert.equal(
    preferences.find((row) => row.category === "press_box")!.push,
    false,
  );
  for (const row of preferences.filter((row) => row.category !== "press_box")) {
    assert.equal(row.inbox, true);
    assert.equal(row.push, true);
  }
  f.signIn(null);
  await assert.rejects(
    handler(enableDraftReminders)(f.ctx, {}),
    /Unauthenticated/,
  );
});

void test("test push is private to the selected device and limited to once a minute", async (t) => {
  const names = [
    "WEB_PUSH_PUBLIC_KEY",
    "WEB_PUSH_PRIVATE_KEY",
    "WEB_PUSH_SUBJECT",
  ] as const;
  const previous = names.map((name) => process.env[name]);
  names.forEach((name) => {
    process.env[name] = "test-placeholder";
  });
  t.after(() =>
    names.forEach((name, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }),
  );
  const f = fixture();
  f.put("pushSubscriptions", "device", { userId: "someone-else" });
  await assert.rejects(
    handler(testPush)(f.ctx, { deviceId }),
    /Enable notifications/,
  );
  f.get("device")!.userId = userId;
  await handler(testPush)(f.ctx, { deviceId });
  assert.equal(f.scheduled.length, 1);
  const notification = [...f.rows("notifications").values()][0]!;
  assert.equal(notification.userId, userId);
  assert.equal(notification.inbox, false);
  await assert.rejects(handler(testPush)(f.ctx, { deviceId }), /Wait a minute/);
});

void test("upcoming alerts follow traded pick owners and skip signing slots", async () => {
  const f = fixture();
  const now = Date.now();
  f.put("seasons", "season", { name: "Test season", draftStartAt: now - 1000 });
  for (const [team, owner] of [
    ["first", "owner"],
    ["traded", "new-owner"],
    ["third", "third-owner"],
  ]) {
    f.put("teams", team!, {
      seasonId: "season",
      franchiseId: `${team}-franchise`,
    });
    f.put("franchises", `${team}-franchise`, { ownerId: owner, name: team });
  }
  f.put("draftPicks", "signing", {
    seasonId: "season",
    gshlTeamId: "third",
    round: 0,
    pick: 1,
    isSigning: true,
  });
  f.put("draftPicks", "active", {
    seasonId: "season",
    gshlTeamId: "first",
    round: 1,
    pick: 1,
  });
  f.put("draftPicks", "next", {
    seasonId: "season",
    gshlTeamId: "traded",
    originalTeamId: "first",
    round: 1,
    pick: 2,
  });
  f.put("draftPicks", "later", {
    seasonId: "season",
    gshlTeamId: "third",
    round: 1,
    pick: 3,
  });
  await handler(notifyState)(f.ctx, { seasonId: "season" });
  await handler(notifyState)(f.ctx, { seasonId: "season" });
  const upcoming = [...f.rows("notificationEvents").values()].filter(
    (row) => row.category === "draft_upcoming",
  );
  assert.equal(upcoming.length, 2);
  assert.deepEqual(
    upcoming.map((row) => row.ownerId),
    ["new-owner", "third-owner"],
  );
  assert.ok(upcoming.every((row) => row.pickId !== "signing"));
});

void test("start reminder waits for its window and stale rescheduling cancels push", async () => {
  const f = fixture();
  const start = Date.now() + 10 * 60000;
  f.put("seasons", "season", { name: "Test season", draftStartAt: start });
  f.put("draftPicks", "pick", { seasonId: "season", round: 1, pick: 1 });
  await handler(notifyState)(f.ctx, { seasonId: "season" });
  const event = [...f.rows("notificationEvents").values()][0]!;
  assert.equal(event.category, "draft_start");
  f.put("notifications", "notification", { userId, eventId: event._id });
  f.put("pushSubscriptions", "device", { userId });
  assert.ok(await handler(delivery)(f.ctx, { notificationId, deviceId }));
  f.get("season")!.draftStartAt = start + 3600000;
  assert.equal(
    await handler(delivery)(f.ctx, { notificationId, deviceId }),
    null,
  );
  await handler(notifyState)(f.ctx, { seasonId: "season" });
  assert.equal(f.rows("notificationEvents").size, 1);
});

void test("eight independent preferences preserve explicit opt-outs", () => {
  assert.equal(NOTIFICATION_OPTIONS.length, 8);
  assert.equal(
    new Set(NOTIFICATION_OPTIONS.map((option) => option.key)).size,
    8,
  );
  assert.deepEqual(notificationChoice("draft_turn"), {
    inbox: true,
    push: true,
  });
  assert.deepEqual(notificationChoice("press_box"), {
    inbox: true,
    push: false,
  });
  assert.deepEqual(
    notificationChoice("draft_turn", { inbox: false, push: false }),
    { inbox: false, push: false },
  );
});

void test("push endpoints reject local addresses, credentials and deceptive domains", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/a",
    "https://updates.push.services.mozilla.com/wpush/v2/a",
    "https://web.push.apple.com/a",
    "https://a.wns.windows.com/a",
  ])
    assert.equal(isAllowedPushEndpoint(endpoint), true);
  for (const endpoint of [
    "http://fcm.googleapis.com/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://fcm.googleapis.com.evil.test/a",
    "https://evilpush.apple.com/a",
    "https://user:pass@fcm.googleapis.com/a",
    "https://fcm.googleapis.com:444/a",
    "invalid",
  ])
    assert.equal(isAllowedPushEndpoint(endpoint), false);
});

void test("private mutations enforce active identity and resource ownership", async () => {
  const f = fixture();
  f.put("notifications", "notification", { userId: "another" });
  f.put("pushSubscriptions", "device", { userId: "another" });
  await assert.rejects(
    handler(markRead)(f.ctx, { id: notificationId }),
    /not found/,
  );
  await assert.rejects(
    handler(removeDevice)(f.ctx, { id: deviceId }),
    /not found/,
  );
  await assert.rejects(
    handler(announce)(f.ctx, { title: "Hello", body: "League news" }),
    /Forbidden/,
  );
  f.signIn(null);
  await assert.rejects(
    handler(savePreference)(f.ctx, {
      category: "draft_turn",
      inbox: true,
      push: true,
    }),
    /Unauthenticated/,
  );
  f.signIn("user");
  f.get("user")!.status = "disabled";
  await assert.rejects(
    handler(savePreference)(f.ctx, {
      category: "draft_turn",
      inbox: true,
      push: true,
    }),
    /Unauthenticated/,
  );
});

void test("subscriptions cannot be stolen from another account", async () => {
  const f = fixture();
  const subscription = {
    endpoint: "https://fcm.googleapis.com/test",
    p256dh: "a".repeat(87),
    auth: "b".repeat(22),
    label: "Test browser",
  };
  f.put("pushSubscriptions", "device", { userId: "another", ...subscription });
  await assert.rejects(
    handler(subscribe)(f.ctx, subscription),
    /another account/,
  );
  assert.equal(f.get("device")!.userId, "another");
});

void test("fan-out is idempotent and honors each channel independently", async () => {
  const f = fixture();
  f.put("notificationEvents", "event", {
    category: "draft_turn",
    ownerId: "owner",
    title: "Your turn",
    body: "Pick now",
    href: "/draft",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
  });
  f.put("pushSubscriptions", "device", { userId });
  await handler(savePreference)(f.ctx, {
    category: "draft_turn",
    inbox: false,
    push: true,
  });
  await handler(fanOut)(f.ctx, { eventId, cursor: null });
  await handler(fanOut)(f.ctx, { eventId, cursor: null });
  assert.equal(f.rows("notifications").size, 1);
  assert.equal([...f.rows("notifications").values()][0]!.inbox, false);
  assert.equal(f.scheduled.length, 1);
});

void test("delivery rechecks user status, preferences, expiry and revoked subscriptions", async () => {
  const f = fixture();
  f.put("notifications", "notification", { userId, eventId });
  f.put("pushSubscriptions", "device", { userId });
  f.put("notificationEvents", "event", {
    category: "draft_turn",
    expiresAt: Date.now() + 60000,
  });
  const args = { notificationId, deviceId };
  assert.ok(await handler(delivery)(f.ctx, args));
  await handler(savePreference)(f.ctx, {
    category: "draft_turn",
    inbox: true,
    push: false,
  });
  assert.equal(await handler(delivery)(f.ctx, args), null);
  await handler(savePreference)(f.ctx, {
    category: "draft_turn",
    inbox: true,
    push: true,
  });
  f.get("user")!.status = "disabled";
  assert.equal(await handler(delivery)(f.ctx, args), null);
  f.get("user")!.status = "active";
  f.get("event")!.expiresAt = 0;
  assert.equal(await handler(delivery)(f.ctx, args), null);
  f.get("event")!.expiresAt = Date.now() + 60000;
  await handler(removeDevice)(f.ctx, { id: deviceId });
  assert.equal(await handler(delivery)(f.ctx, args), null);
});

void test("draft reminders use the live clock, deduplicate, and suppress picked or undone turns", async () => {
  const f = fixture();
  const now = Date.now();
  f.put("seasons", "season", {
    name: "Test season",
    draftStartAt: now - 190000,
  });
  f.put("teams", "team", { seasonId: "season", franchiseId: "franchise" });
  f.put("franchises", "franchise", { ownerId: "owner", name: "Test team" });
  f.put("draftPicks", "pick", {
    seasonId: "season",
    gshlTeamId: "team",
    round: 1,
    pick: 1,
    onClockStartedAt: now - 190000,
    onClockExpiresAt: now + 50000,
    isSigning: false,
  });
  await handler(notifyState)(f.ctx, { seasonId: "season" });
  await handler(notifyState)(f.ctx, { seasonId: "season" });
  assert.deepEqual(
    [...f.rows("notificationEvents").values()]
      .map((row) => row.category)
      .sort(),
    ["draft_clock", "draft_turn"],
  );
  const event = [...f.rows("notificationEvents").values()].find(
    (row) => row.category === "draft_turn",
  )!;
  f.put("notifications", "notification", { userId, eventId: event._id });
  f.put("pushSubscriptions", "device", { userId });
  assert.ok(await handler(delivery)(f.ctx, { notificationId, deviceId }));
  f.get("pick")!.playerId = "player";
  assert.equal(
    await handler(delivery)(f.ctx, { notificationId, deviceId }),
    null,
  );
  f.get("pick")!.playerId = null;
  f.get("pick")!.onClockStartedAt = now;
  assert.equal(
    await handler(delivery)(f.ctx, { notificationId, deviceId }),
    null,
  );
});

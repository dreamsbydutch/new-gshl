import assert from "node:assert/strict";
import test from "node:test";
import { provisionIdentity } from "./nightlyNhlStats";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const official = {
  nhlPlayerId: 8483787,
  firstName: "Cole",
  lastName: "Knuble",
  birthDate: "2004-07-01",
  position: "C",
  sourceUrl: "https://api-web.nhle.com/v1/player/8483787/landing",
  sourceFetchedAt: Date.now(),
  sourceSha256: "a".repeat(64),
};
function fixture() {
  process.env.CONVEX_SERVER_SECRET = "identity-test";
  const f = mutationFixture();
  f.put("players", "other", { fullName: "Other Person", nhlApiId: "123" });
  return f;
}
function args(f: ReturnType<typeof fixture>) {
  return {
    serverSecret: "identity-test",
    official: { ...official },
    expectedPlayerPopulation: f
      .rows("players")
      .map((row) => ({
        _id: row._id,
        ...(row.nhlApiId === undefined ? {} : { nhlApiId: row.nhlApiId }),
      })),
  };
}
void test("new official NHL identity is previewable and creates an unowned non-signable person without financial fields", async () => {
  const f = fixture(),
    before = structuredClone(f.rows("players"));
  const preview = (await invokeMutation(provisionIdentity, f.ctx, args(f))) as {
    action: string;
    playerId: null;
  };
  assert.equal(preview.action, "create");
  assert.equal(preview.playerId, null);
  assert.deepEqual(f.rows("players"), before);
  const result = (await invokeMutation(provisionIdentity, f.ctx, {
    ...args(f),
    apply: true,
  })) as { playerId: string };
  const row = f.get(result.playerId)!;
  assert.equal(row.nhlApiId, "8483787");
  assert.equal(row.fullName, "Cole Knuble");
  assert.equal(row.isActive, true);
  assert.equal(row.isSignable, false);
  assert.equal(row.isResignable, false);
  for (const key of [
    "ownerId",
    "gshlTeamId",
    "salary",
    "overallRating",
    "nhlSalary",
    "nhlCapHit",
    "seasonRating",
  ])
    assert.equal(Object.hasOwn(row, key), false);
  const repeat = (await invokeMutation(provisionIdentity, f.ctx, {
    ...args(f),
    apply: true,
  })) as { action: string; playerId: string };
  assert.equal(repeat.action, "existing");
  assert.equal(repeat.playerId, result.playerId);
  assert.equal(f.rows("players").length, 2);
});
void test("unique normalized name links only with independent exact DOB and role, preserving ownership and every other byte", async () => {
  const f = fixture();
  f.put("players", "candidate", {
    fullName: "Cólé Knuble",
    firstName: "Cole",
    birthday: Date.parse("2004-07-01T00:00:00Z"),
    posGroup: "F",
    ownerId: "owner",
    salary: 123,
    isSignable: true,
  });
  const before = structuredClone(f.get("candidate"));
  const preview = (await invokeMutation(provisionIdentity, f.ctx, args(f))) as {
    action: string;
  };
  assert.equal(preview.action, "link");
  assert.deepEqual(f.get("candidate"), before);
  await invokeMutation(provisionIdentity, f.ctx, { ...args(f), apply: true });
  assert.deepEqual(f.get("candidate"), { ...before, nhlApiId: "8483787" });
});
void test("names alone, duplicate names/IDs, wrong DOB or role, and assigned other IDs require review", async () => {
  for (const mode of [
    "no-dob",
    "wrong-dob",
    "wrong-role",
    "assigned",
    "duplicate-name",
    "duplicate-id",
  ]) {
    const f = fixture();
    f.put("players", "candidate", {
      fullName: "Cole Knuble",
      birthday: "2004-07-01",
      posGroup: "F",
    });
    if (mode === "no-dob") delete f.get("candidate")!.birthday;
    if (mode === "wrong-dob") f.get("candidate")!.birthday = "2004-07-02";
    if (mode === "wrong-role") f.get("candidate")!.posGroup = "D";
    if (mode === "assigned") f.get("candidate")!.nhlApiId = "456";
    if (mode === "duplicate-name")
      f.put("players", "twin", {
        fullName: "Cole Knuble",
        birthday: "2004-07-01",
        posGroup: "F",
      });
    if (mode === "duplicate-id") {
      f.get("candidate")!.nhlApiId = "8483787";
      f.get("other")!.nhlApiId = "8483787";
    }
    const before = structuredClone(f.rows("players"));
    await assert.rejects(
      invokeMutation(provisionIdentity, f.ctx, { ...args(f), apply: true }),
    );
    assert.deepEqual(f.rows("players"), before);
  }
});
void test("authorization, population CAS, endpoint allowlist, dates, names, ID and role are validated before writes", async () => {
  for (const mode of [
    "auth",
    "population",
    "origin",
    "path",
    "query",
    "id",
    "overflow-date",
    "future",
    "young",
    "name",
    "role",
    "protected",
  ]) {
    const f = fixture(),
      input = args(f);
    if (mode === "auth") input.serverSecret = "wrong";
    if (mode === "population")
      f.put("players", "new", { fullName: "New Person" });
    if (mode === "origin")
      input.official.sourceUrl =
        "https://example.invalid/v1/player/8483787/landing";
    if (mode === "path")
      input.official.sourceUrl =
        "https://api-web.nhle.com/v1/player/123/landing";
    if (mode === "query") input.official.sourceUrl += "?token=x";
    if (mode === "id") input.official.nhlPlayerId = 1.5;
    if (mode === "overflow-date") input.official.birthDate = "2004-02-30";
    if (mode === "future") input.official.birthDate = "2099-01-01";
    if (mode === "young") input.official.birthDate = "2020-01-01";
    if (mode === "name") input.official.firstName = " ";
    if (mode === "role") input.official.position = "X";
    if (mode === "protected")
      Object.assign(input.official, { ownerId: "owner" });
    const before = structuredClone(f.rows("players"));
    await assert.rejects(
      invokeMutation(provisionIdentity, f.ctx, { ...input, apply: true }),
    );
    assert.deepEqual(f.rows("players"), before);
  }
});

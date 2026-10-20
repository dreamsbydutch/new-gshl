import assert from "node:assert/strict";
import test from "node:test";
import { prepareNightlyIdentities } from "./nightly-identities";

const source = {
  nhlPlayerId: 8483787,
  name: "Cole Knuble",
  fields: { posGroup: "F", GP: 1 },
};
const landing = {
  playerId: 8483787,
  firstName: { default: "Cole" },
  lastName: { default: "Knuble" },
  birthDate: "2004-07-01",
  position: "C",
};
test("known canonical IDs never fetch identity sources; debutants require independent matching landing", async () => {
  let calls = 0;
  assert.deepEqual(
    await prepareNightlyIdentities(
      [{ nhlApiId: "8483787" }],
      [source],
      async () => {
        throw Error("must not fetch");
      },
    ),
    [],
  );
  const result = await prepareNightlyIdentities(
    [],
    [source, source],
    async (url) => {
      calls++;
      assert.equal(url, "https://api-web.nhle.com/v1/player/8483787/landing");
      return landing;
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].official.nhlPlayerId, 8483787);
  assert.match(result[0].official.sourceSha256, /^[a-f0-9]{64}$/);
});
test("conflicting official ID, name, role, or invalid birth date never provisions a player", async () => {
  for (const patch of [
    { playerId: 1 },
    { firstName: { default: "Different" } },
    { position: "G" },
    { birthDate: "2004-02-30" },
    { birthDate: "unknown" },
  ])
    await assert.rejects(
      prepareNightlyIdentities([], [source], async () => ({
        ...landing,
        ...patch,
      })),
      /sources disagree/,
    );
});

import assert from "node:assert/strict";
import test from "node:test";
import { prepareNightlyIdentities } from "./nightly-identities";
import {
  auditHistoricalIdentityManifest,
  type HistoricalIdentityManifest,
} from "./historical-native-identities";

async function fixture() {
  const players = [
    {
      nhlPlayerId: 8470000,
      name: "Historic Player",
      fields: { posGroup: "D" },
    },
  ];
  const body = {
    playerId: 8470000,
    firstName: { default: "Historic" },
    lastName: { default: "Player" },
    birthDate: "1980-01-02",
    position: "D",
  };
  const identities = await prepareNightlyIdentities(
      [],
      players,
      async () => body,
    ),
    capturedAt = Date.now();
  identities[0]!.official.sourceFetchedAt = capturedAt;
  const manifest: HistoricalIdentityManifest = {
    version: "nhl-historical-identities-v1",
    sourceSha256: "a".repeat(64),
    capturedAt,
    identities,
  };
  return { players, manifest };
}
test("frozen identity replays name, DOB, position and body hash without network; immutable", async () => {
  const f = await fixture(),
    before = structuredClone(f);
  assert.equal(
    (
      await auditHistoricalIdentityManifest(
        f.manifest,
        "a".repeat(64),
        f.players,
      )
    ).length,
    1,
  );
  assert.deepEqual(f, before);
});
test("wrong source, duplicated ID, stale body hashes, changed role/name and timestamps fail closed", async () => {
  for (const mode of [
    "source",
    "duplicate",
    "body",
    "role",
    "name",
    "time",
    "endpoint",
  ]) {
    const f = await fixture();
    let source = "a".repeat(64);
    if (mode === "source") source = "b".repeat(64);
    if (mode === "duplicate")
      f.manifest.identities.push(structuredClone(f.manifest.identities[0]!));
    if (mode === "body")
      f.manifest.identities[0]!.source.birthDate = "1981-01-02";
    if (mode === "role") f.players[0]!.fields.posGroup = "G";
    if (mode === "name") f.players[0]!.name = "Different Person";
    if (mode === "time") f.manifest.identities[0]!.official.sourceFetchedAt--;
    if (mode === "endpoint")
      f.manifest.identities[0]!.official.sourceUrl = "https://example.invalid/";
    await assert.rejects(
      auditHistoricalIdentityManifest(f.manifest, source, f.players),
      { name: "Error" },
      mode,
    );
  }
});

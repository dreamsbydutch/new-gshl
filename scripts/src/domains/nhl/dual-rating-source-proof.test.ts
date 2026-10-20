import assert from "node:assert/strict";
import test from "node:test";
import { verifyDualRatingSourceFingerprint } from "./dual-rating-source-proof";
const stat = {
  _id: "s",
  seasonId: "season",
  playerId: "wrong",
  posGroup: "G",
  GP: 26,
  W: 14,
  GA: 74,
  SV: 687,
  SA: 761,
  SO: 0,
  TOI: 1473.17,
  nhlTeam: ["TOR"],
};
const official = {
  playerId: 8476899,
  gamesPlayed: 26,
  wins: 14,
  goalsAgainst: 74,
  saves: 687,
  shotsAgainst: 761,
  shutouts: 0,
  timeOnIce: 88390,
  teamAbbrevs: "TOR",
};
const source = {
  nhl: { goalies: [official], skaters: { summary: [], timeonice: [] } },
};
test("requires unique full category, rounded TOI and team evidence", () => {
  assert.equal(
    verifyDualRatingSourceFingerprint(stat, 8476899, source).playerId,
    8476899,
  );
  assert.throws(
    () => verifyDualRatingSourceFingerprint(stat, 8483575, source),
    /fingerprint/,
  );
  assert.throws(
    () =>
      verifyDualRatingSourceFingerprint({ ...stat, SV: 688 }, 8476899, source),
    /fingerprint/,
  );
  assert.throws(
    () =>
      verifyDualRatingSourceFingerprint(
        { ...stat, nhlTeam: ["DAL"] },
        8476899,
        source,
      ),
    /team/,
  );
  assert.throws(
    () =>
      verifyDualRatingSourceFingerprint(stat, 8476899, {
        nhl: {
          ...source.nhl,
          goalies: [official, { ...official, playerId: 2 }],
        },
      }),
    /unique/,
  );
});
test("unknown counts never become zero and partial evidence must be explicit and sufficient", () => {
  assert.throws(
    () =>
      verifyDualRatingSourceFingerprint({ ...stat, W: null }, 8476899, source),
    /explicit disclosure/,
  );
  assert.equal(
    verifyDualRatingSourceFingerprint(
      { ...stat, W: null },
      8476899,
      source,
      undefined,
      ["W"],
    ).playerId,
    8476899,
  );
  assert.throws(
    () =>
      verifyDualRatingSourceFingerprint(
        { ...stat, SV: null },
        8476899,
        source,
        undefined,
        ["SV"],
      ),
    /Insufficient/,
  );
  assert.throws(
    () =>
      verifyDualRatingSourceFingerprint(stat, 8476899, source, undefined, [
        "W",
      ]),
    /disclosure/,
  );
});

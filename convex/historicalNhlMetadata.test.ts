import assert from "node:assert/strict";
import { test } from "node:test";
import { provision } from "./historicalNhlMetadata";
import {
  invokeMutation,
  mutationFixture,
} from "../tools/testing/convexMutationFixture";

type MetadataResult = {
  insertedSeasons: number;
  insertedTeams: number;
  seasons: Array<{ seasonId: string | null }>;
  teams: Array<{ teamId: string | null }>;
};

function documents() {
  return Array.from({ length: 5 }, (_, index) => {
    const year = 2009 + index;
    return {
      nhlOnly: true,
      year: String(year),
      name: `${year - 1}-${String(year).slice(-2)}`,
      categories: [],
      rosterSpots: [],
      startDate: `${year - 1}-10-01`,
      endDate: `${year}-04-30`,
      isActive: false,
      usesLegacyTies: false,
      signingEndDate: null,
      draftStartAt: null,
    };
  });
}

void test("historical metadata dry-run, atomic creation and exact rerun preserve fantasy years", async () => {
  const f = mutationFixture();
  f.put("seasons", "fantasy", { year: "2014", name: "2013-14" });
  const before = f.get("fantasy");
  const args = {
    expectedSeasons: [before],
    expectedTeams: [],
    seasons: documents(),
    teams: [
      {
        officialTeamId: 11,
        abbr: "ATL",
        name: "Atlanta Thrashers",
        logoUrl: "",
      },
    ],
    sourceSha256s: Array.from({ length: 5 }, () => "a".repeat(64)),
  };
  const dry = (await invokeMutation(provision, f.ctx, args)) as MetadataResult;
  assert.equal(dry.insertedSeasons, 5);
  assert.equal(dry.insertedTeams, 1);
  assert.deepEqual(f.get("fantasy"), before);
  assert.equal(
    dry.seasons.every((s) => s.seasonId === null),
    true,
  );
  const applied = (await invokeMutation(provision, f.ctx, {
    ...args,
    apply: true,
  })) as MetadataResult;
  assert.equal(
    applied.seasons.every((s) => typeof s.seasonId === "string"),
    true,
  );
  assert.deepEqual(f.get("fantasy"), before);
  await assert.rejects(
    () => invokeMutation(provision, f.ctx, args),
    /inventory changed/,
  );
  const rerun = (await invokeMutation(provision, f.ctx, {
    ...args,
    expectedSeasons: [
      before,
      ...applied.seasons.map((s) => f.get(s.seasonId!)),
    ],
    expectedTeams: applied.teams.map((t) => f.get(t.teamId!)),
  })) as MetadataResult;
  assert.equal(rerun.insertedSeasons, 0);
  assert.equal(rerun.insertedTeams, 0);
});

void test("a conflicting final operation fails before any historical insertion", async () => {
  const f = mutationFixture();
  f.put("nhlTeams", "club", { abbr: "PHX", name: "Different club" });
  await assert.rejects(
    () =>
      invokeMutation(provision, f.ctx, {
        expectedSeasons: [],
        expectedTeams: [f.get("club")],
        seasons: documents(),
        teams: [
          {
            officialTeamId: 27,
            abbr: "PHX",
            name: "Phoenix Coyotes",
            logoUrl: "",
          },
        ],
        sourceSha256s: Array.from({ length: 5 }, () => "a".repeat(64)),
        apply: true,
      }),
    /Conflicting historical NHL club/,
  );
  const dry = (await invokeMutation(provision, f.ctx, {
    expectedSeasons: [],
    expectedTeams: [f.get("club")],
    seasons: documents(),
    teams: [],
    sourceSha256s: Array.from({ length: 5 }, () => "a".repeat(64)),
  })) as MetadataResult;
  assert.equal(dry.insertedSeasons, 5);
});

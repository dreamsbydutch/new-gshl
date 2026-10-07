import assert from "node:assert/strict";
import test from "node:test";
import { buildOwnerRankingMatchupComparison } from "./owner-ranking-research";
import type { WeeklyEditionResearch } from "../../types/weekly-edition";

function owners(): WeeklyEditionResearch["owners"] {
  return Array.from({ length: 14 }, (_, index) => ({
    ownerId: `owner-${index + 1}`,
    name: `Owner ${index + 1}`,
    teamId: `team-${index + 1}`,
    teamName: `Club ${index + 1}`,
    seasons: [],
    absentSeasons: 0,
    status: "continuing",
    ranking: {
      ownerId: `owner-${index + 1}`,
      gmName: `Owner ${index + 1}`,
      rank: index * 2 + 1,
      rating: 900 - index * 40,
      rankChange: 0,
      gamesPlayed: 50,
      overallWins: 30,
      overallLosses: 20,
      playoffAppearances: 2,
      cups: index === 0 ? 1 : 0,
    },
  }));
}
const options = {
  asOf: "2026-09-28",
  homeTeamId: "team-1",
  awayTeamId: "team-3",
};

void test("notable owner pairings use the season cohort while retaining actual historical ranks", () => {
  const cohort = owners();
  const before = structuredClone(cohort);
  const top = buildOwnerRankingMatchupComparison({
    ...options,
    owners: cohort,
  })!;
  assert.equal(top.storyline, "top_owners");
  assert.equal(top.rankedOwnersInSeason, 14);
  assert.equal(top.away.ladderRank, 5);
  assert.equal(top.away.seasonOwnerRank, 3);
  assert.equal(top.asOf, options.asOf);
  assert.equal(top.home.cups, 1);
  assert.ok(!JSON.stringify(top).includes('"rating"'));
  assert.equal(
    buildOwnerRankingMatchupComparison({
      ...options,
      owners: cohort,
      homeTeamId: "team-12",
      awayTeamId: "team-14",
    })?.storyline,
    "lower_ranked_owners",
  );
  assert.equal(
    buildOwnerRankingMatchupComparison({
      ...options,
      owners: cohort,
      awayTeamId: "team-14",
    })?.storyline,
    "large_rank_gap",
  );
  assert.equal(
    buildOwnerRankingMatchupComparison({
      ...options,
      owners: cohort,
      homeTeamId: "team-7",
      awayTeamId: "team-8",
    }),
    undefined,
  );
  assert.deepEqual(cohort, before);
});

void test("missing history, novice owners, duplicate owners and tied base ratings do not invent a storyline", () => {
  const cohort = owners();
  cohort[2]!.ranking = undefined;
  assert.equal(
    buildOwnerRankingMatchupComparison({ ...options, owners: cohort }),
    undefined,
  );
  const novice = owners();
  novice[13]!.ranking!.gamesPlayed = 0;
  assert.equal(
    buildOwnerRankingMatchupComparison({
      ...options,
      owners: novice,
      awayTeamId: "team-14",
    }),
    undefined,
  );
  assert.equal(
    buildOwnerRankingMatchupComparison({
      ...options,
      owners: owners(),
      awayTeamId: "team-1",
    }),
    undefined,
  );
  assert.equal(
    buildOwnerRankingMatchupComparison({
      ...options,
      owners: owners().slice(0, 3),
    }),
    undefined,
  );
  const tied = owners().map((owner) => ({
    ...owner,
    ranking: { ...owner.ranking!, rating: 250 },
  }));
  assert.equal(
    buildOwnerRankingMatchupComparison({ ...options, owners: tied }),
    undefined,
  );
  assert.equal(
    buildOwnerRankingMatchupComparison({
      ...options,
      owners: [...owners(), ...owners()],
    })?.rankedOwnersInSeason,
    14,
  );
});

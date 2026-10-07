import assert from "node:assert/strict";
import test from "node:test";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import { loadOwnerRankingResearch } from "./lib/ownerRankingResearch";
import { prepareAiGeneration } from "./weeklyEditions";
import { loadMatchupPreviewEvidence } from "./lib/matchupPreviewEvidence";
import { ownerRankings } from "./frontend";
import type { Doc, Id } from "./_generated/dataModel";
import type {
  WeeklyEditionFactPacket,
  OwnerRankingsBrowserViewModel,
} from "../src/lib/types";

function fixture() {
  const f = mutationFixture();
  f.put("seasons", "season", {
    name: "2026-27",
    year: 2027,
    categories: ["G", "A"],
    startDate: Date.parse("2026-09-01"),
    endDate: Date.parse("2027-04-15"),
  });
  f.put("conferences", "conference", { name: "Conference" });
  for (let i = 1; i <= 8; i++) {
    f.put("owners", `owner-${i}`, {
      firstName: "Owner",
      lastName: String(i),
      nickName: `Owner ${i}`,
      isActive: true,
    });
    f.put("franchises", `franchise-${i}`, {
      name: `Club ${i}`,
      abbr: `C${i}`,
      ownerId: `owner-${i}`,
      isActive: true,
      beatWriter: `Reporter ${i}`,
    });
    f.put("teams", `team-${i}`, {
      seasonId: "season",
      confId: "conference",
      franchiseId: `franchise-${i}`,
    });
    f.put("teamWeekStatLines", `stats-${i}`, {
      seasonId: "season",
      weekId: "recap-week",
      gshlTeamId: `team-${i}`,
      GP: 20,
      G: i,
      A: i,
      Rating: 80,
    });
  }
  f.put("playerWeekStatLines", "player-stats", {
    seasonId: "season",
    weekId: "recap-week",
    gshlTeamId: "team-1",
    playerId: "player",
    Rating: 80,
    P: 4,
  });
  for (let week = 1; week <= 12; week++) {
    f.put("weeks", `week-${week}`, {
      seasonId: "season",
      weekNum: week,
      startDate: Date.parse("2026-09-01") + (week - 1) * 86400000,
      endDate: Date.parse("2026-09-01") + (week - 1) * 86400000,
    });
    for (let i = 1; i <= 4; i++) {
      f.put("matchups", `matchup-${week}-${i}`, {
        seasonId: "season",
        weekId: `week-${week}`,
        homeTeamId: `team-${i}`,
        awayTeamId: `team-${i + 4}`,
        gameType: "NC",
        homeScore: i <= 2 || week % 2 === 0 ? 7 : 3,
        awayScore: i <= 2 || week % 2 === 0 ? 3 : 7,
        homeWin: i <= 2 || week % 2 === 0,
        awayWin: i > 2 && week % 2 !== 0,
        isComplete: true,
      });
    }
  }
  f.put("weeks", "recap-week", {
    seasonId: "season",
    weekNum: 13,
    startDate: Date.parse("2026-09-20"),
    endDate: Date.parse("2026-09-26"),
  });
  f.put("matchups", "recap", {
    seasonId: "season",
    weekId: "recap-week",
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    gameType: "NC",
    homeScore: 3,
    awayScore: 7,
    awayWin: true,
    isComplete: true,
  });
  f.put("weeks", "future-week", {
    seasonId: "season",
    weekNum: 14,
    startDate: Date.parse("2026-10-04"),
    endDate: Date.parse("2026-10-10"),
  });
  f.put("matchups", "future", {
    seasonId: "season",
    weekId: "future-week",
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    gameType: "NC",
    isComplete: false,
  });
  return f;
}

void test("research rankings match the actual Owner Ladder facade for the same completed data", async () => {
  const f = fixture();
  const publicView = (await invokeMutation(
    ownerRankings,
    f.ctx,
    {},
  )) as OwnerRankingsBrowserViewModel;
  const research = await loadOwnerRankingResearch(
    f.ctx,
    "season" as Id<"seasons">,
    "2027-04-16",
  );
  for (const entry of publicView.rankings) {
    const fact = research.find((row) => row.ownerId === entry.owner.id)!;
    assert.equal(fact.rank, entry.rank);
    assert.equal(fact.rating, entry.rating);
    assert.equal(fact.overallWins, entry.overallRecord.wins);
    assert.equal(fact.overallLosses, entry.overallRecord.losses);
    assert.equal(fact.cups, entry.cups);
  }
  assert.ok(!JSON.stringify(research).includes('"email"'));
  assert.ok(!JSON.stringify(research).includes('"owing"'));
});

void test("owner research uses the public ladder model with no unfinished scores or future award leakage", async () => {
  const f = fixture();
  const before = await loadOwnerRankingResearch(
    f.ctx,
    "season" as Id<"seasons">,
    "2026-09-19",
  );
  assert.equal(
    before.find((row) => row.ownerId === "owner-1")?.overallWins,
    12,
  );
  assert.equal(
    before.find((row) => row.ownerId === "owner-1")?.overallLosses,
    0,
  );
  const after = await loadOwnerRankingResearch(
    f.ctx,
    "season" as Id<"seasons">,
    "2026-09-26",
  );
  assert.equal(
    after.find((row) => row.ownerId === "owner-1")?.overallLosses,
    1,
  );
  f.put("teamAwards", "future-award", {
    seasonId: "season",
    ownerId: "owner-1",
    award: "hart",
  });
  f.put("matchups", "unfinished", {
    seasonId: "season",
    weekId: "week-1",
    homeTeamId: "team-1",
    awayTeamId: "team-8",
    gameType: "NC",
    homeScore: 10,
    awayScore: 0,
  });
  assert.deepEqual(
    await loadOwnerRankingResearch(
      f.ctx,
      "season" as Id<"seasons">,
      "2026-09-19",
    ),
    before,
  );
});

void test("weekly preparation gives recap and upcoming research entering-week owner context", async () => {
  const f = fixture();
  const prepared = (await invokeMutation(prepareAiGeneration, f.ctx, {
    seasonId: "season",
    weekId: "recap-week",
    issueType: "weekly",
  })) as { facts: WeeklyEditionFactPacket };
  const facts = prepared.facts;
  assert.equal(facts.research?.ownerRankingsAsOf, "2026-09-19");
  assert.equal(
    facts.research?.owners.find((row) => row.ownerId === "owner-1")?.ranking
      ?.overallLosses,
    0,
  );
  assert.equal(
    facts.matchups[0]?.ownerRankingComparison?.storyline,
    "top_owners",
  );
  assert.match(
    facts.editorialCandidates.find((row) => row.id === "matchup:recap")!
      .summary,
    /Optional owner-ranking storyline/,
  );
  const future = facts.editorialCandidates.find(
    (row) => row.id === "upcoming:future",
  )!;
  assert.equal(future.kind, "upcoming_matchup");
  assert.match(future.summary, /top_owners/);
  assert.ok(
    future.importance < 60,
    "owner context must preserve the recap's preview priority",
  );
  assert.equal(f.rows("weeklyEditions").length, 0);
});

void test("both matchup writers receive the same dated owner comparison", async () => {
  const f = fixture();
  const matchup = f.get("future") as Doc<"matchups">;
  const now = Date.parse("2026-10-01T08:00:00Z");
  const startsAt = Date.parse("2026-10-04T07:00:00Z");
  const home = await loadMatchupPreviewEvidence(
    f.ctx,
    matchup,
    "team-1" as Id<"teams">,
    startsAt,
    now,
  );
  const away = await loadMatchupPreviewEvidence(
    f.ctx,
    matchup,
    "team-2" as Id<"teams">,
    startsAt,
    now,
  );
  const fact = home?.facts.find((row) => row.id === "owner-ranking-comparison");
  assert.ok(fact);
  assert.deepEqual(
    fact,
    away?.facts.find((row) => row.id === "owner-ranking-comparison"),
  );
  assert.match(fact.text, /"storyline":"top_owners"/);
  assert.ok(!fact.text.includes('"rating"'));
});

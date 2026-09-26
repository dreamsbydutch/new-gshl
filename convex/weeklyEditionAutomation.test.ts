import assert from "node:assert/strict";
import { test } from "node:test";
import { ConvexError } from "convex/values";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import {
  scanDueMilestones,
  transitionAutomaticEdition,
  prepareAiGeneration,
} from "./weeklyEditions";
import type { WeeklyEditionFactPacket } from "../src/lib/types";

void test("manual preseason selection covers that season, not the following draft", async () => {
  const f = mutationFixture();
  for (const [id, year] of [
    ["previous", 2026],
    ["selected", 2027],
    ["next", 2028],
  ] as const) {
    f.put("seasons", id, {
      name: `${year - 1}-${year}`,
      year,
      startDate: Date.parse(`${year - 1}-10-01`),
      endDate: Date.parse(`${year}-04-15`),
      draftStartAt: `${year - 1}-09-20`,
      categories: [],
    });
    f.put("weeks", `${id}:week`, {
      seasonId: id,
      weekNum: id === "previous" ? 25 : 1,
      startDate: id === "previous" ? "2026-04-08" : `${year - 1}-10-01`,
      endDate: id === "previous" ? "2026-04-15" : `${year - 1}-10-07`,
    });
    f.put("teams", `${id}:team`, {
      seasonId: id,
      franchiseId: "club",
      confId: "conference",
    });
    f.put("draftPicks", `${id}:pick`, {
      seasonId: id,
      gshlTeamId: `${id}:team`,
      round: 1,
      pick: 1,
      isSigning: false,
      ...(id === "selected" ? { playerId: "player" } : {}),
    });
  }
  f.put("franchises", "club", {
    ownerId: "owner",
    name: "Selected club",
    abbr: "SC",
  });
  f.put("players", "player", { fullName: "Drafted player", nhlPos: ["C"] });
  f.put("contracts", "contract", {
    ownerId: "owner",
    playerId: "player",
    seasonId: "previous",
    contractLength: 1,
    startDate: Date.parse("2026-10-01"),
    expiryDate: Date.parse("2027-04-15"),
  });
  const args = {
    seasonId: "selected",
    weekId: "selected:week",
    issueType: "preseason",
    seasonSelection: "edition",
  };
  const prepared = (await invokeMutation(prepareAiGeneration, f.ctx, args)) as {
    seasonId: string;
    weekId: string;
    facts: WeeklyEditionFactPacket;
  };
  assert.equal(prepared.seasonId, "previous");
  assert.equal(prepared.weekId, "previous:week");
  assert.equal(prepared.facts.research?.analysisSeasonId, "selected");
  assert.equal(f.rows("weeklyEditions").length, 0);
  const automatic = (await invokeMutation(prepareAiGeneration, f.ctx, {
    seasonId: "previous",
    weekId: "previous:week",
    issueType: "preseason",
  })) as { facts: WeeklyEditionFactPacket };
  assert.deepEqual(prepared.facts, automatic.facts);
  f.put("draftPicks", "selected:pick", {
    seasonId: "selected",
    isSigning: false,
  });
  await assert.rejects(
    invokeMutation(prepareAiGeneration, f.ctx, args),
    (error: unknown) => {
      assert.ok(error instanceof ConvexError);
      assert.match(String(error.data), /2026-2027 draft is not complete/);
      return true;
    },
  );
});

function fixture() {
  const f = mutationFixture();
  f.put("seasons", "s", {
    name: "Current season",
    year: 2025,
    isActive: true,
    startDate: "2025-10-01",
    endDate: "2099-04-01",
    categories: ["G", "A"],
  });
  f.put("weeks", "w", {
    seasonId: "s",
    weekNum: 1,
    startDate: "2025-10-01",
    endDate: "2025-10-07",
  });
  f.put("weeks", "future", {
    seasonId: "s",
    weekNum: 2,
    startDate: "2099-10-08",
    endDate: "2099-10-14",
  });
  return f;
}

void test("automatic scanner queues once, leases work, and stops after three failures", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    const f = fixture();
    await invokeMutation(scanDueMilestones, f.ctx, {});
    await invokeMutation(scanDueMilestones, f.ctx, {});
    assert.equal(f.scheduled.length, 1);
    const job = f.rows("weeklyEditionGenerationJobs")[0]!;
    assert.equal(job.editionKey, "week:w");
    for (let attempt = 1; attempt <= 3; attempt++) {
      assert.ok(
        await invokeMutation(transitionAutomaticEdition, f.ctx, {
          jobId: job._id,
          attempt,
          status: "running",
        }),
      );
      assert.equal(
        await invokeMutation(transitionAutomaticEdition, f.ctx, {
          jobId: job._id,
          attempt,
          status: "running",
        }),
        null,
      );
      await invokeMutation(transitionAutomaticEdition, f.ctx, {
        jobId: job._id,
        attempt,
        status: "failed",
        error: "Source unavailable",
      });
      await invokeMutation(scanDueMilestones, f.ctx, {});
    }
    assert.equal(f.scheduled.length, 3);
    assert.equal(job.status, "failed");
    assert.equal(
      await invokeMutation(transitionAutomaticEdition, f.ctx, {
        jobId: job._id,
        attempt: 1,
        status: "succeeded",
      }),
      null,
    );
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});

void test("automatic scanner protects human edits, hidden issues, and AI editions", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    for (const overrides of [
      { editedBy: "commissioner" },
      { status: "hidden" },
      { generationMode: "openai" },
      { inactiveSectionIds: ["article_1"] },
    ]) {
      const f = fixture();
      f.put("weeklyEditions", "edition", {
        seasonId: "s",
        editionKey: "week:w",
        generationMode: "template",
        status: "published",
        ...overrides,
      });
      await invokeMutation(scanDueMilestones, f.ctx, {});
      assert.equal(f.scheduled.length, 0);
    }
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});

void test("automatic scanner skips an already-succeeded job without reading its edition", async () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    const f = fixture();
    f.put("weeklyEditionGenerationJobs", "job", {
      seasonId: "s",
      weekId: "w",
      editionKey: "week:w",
      issueType: "weekly",
      status: "succeeded",
      attempts: 1,
      leaseUntil: 0,
      updatedAt: Date.now(),
    });
    const originalQuery = f.ctx.db.query;
    f.ctx.db.query = ((table: string) => {
      if (table === "weeklyEditions")
        throw new Error("scanner should not read an already-generated edition");
      return originalQuery(table);
    }) as typeof f.ctx.db.query;

    await invokeMutation(scanDueMilestones, f.ctx, {});
    assert.equal(f.scheduled.length, 0);
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});

void test("AI preparation connects owner history, opponents and dated results without private owner data", async () => {
  const f = fixture();
  f.put("seasons", "old", { name: "Earlier season", year: 2023 });
  f.put("seasons", "gap", { name: "Intervening season", year: 2024 });
  f.put("owners", "owner", {
    firstName: "Returning",
    lastName: "Owner",
    nickName: "Returner",
    email: "private@example.invalid",
    owing: 999,
  });
  f.put("owners", "opponent", { firstName: "Other", lastName: "Owner" });
  f.put("franchises", "f", { ownerId: "owner", name: "Current club" });
  f.put("franchises", "old-f", { ownerId: "owner", name: "Earlier club" });
  f.put("franchises", "other-f", {
    ownerId: "opponent",
    name: "Opponent club",
  });
  f.put("teams", "t", {
    seasonId: "s",
    franchiseId: "f",
    confId: "conference",
  });
  f.put("teams", "other", {
    seasonId: "s",
    franchiseId: "other-f",
    confId: "conference",
  });
  f.put("teams", "old-t", { seasonId: "old", franchiseId: "old-f" });
  f.put("matchups", "m", {
    seasonId: "s",
    weekId: "w",
    homeTeamId: "t",
    awayTeamId: "other",
    homeScore: 6,
    awayScore: 3,
    isComplete: true,
    gameType: "CC",
  });
  f.put("matchups", "next", {
    seasonId: "s",
    weekId: "future",
    homeTeamId: "other",
    awayTeamId: "t",
    homeScore: 99,
    awayScore: 0,
    isComplete: false,
    gameType: "CC",
  });
  f.put("playerWeekStatLines", "pw", {
    seasonId: "s",
    weekId: "w",
    playerId: "p",
    gshlTeamId: "t",
    Rating: 80,
    P: 4,
  });
  for (const team of ["t", "other"])
    f.put("teamWeekStatLines", `stats:${team}`, {
      seasonId: "s",
      weekId: "w",
      gshlTeamId: team,
      Rating: 80,
      G: 5,
      A: 4,
    });
  const prepared = (await invokeMutation(prepareAiGeneration, f.ctx, {
    seasonId: "s",
    weekId: "w",
    issueType: "weekly",
  })) as { facts: WeeklyEditionFactPacket };
  assert.equal(
    prepared.facts.research?.owners.find((owner) => owner.ownerId === "owner")
      ?.status,
    "returning",
  );
  assert.equal(prepared.facts.nextMatchups[0]?.homeTeamId, "other");
  assert.match(
    prepared.facts.editorialCandidates.find((row) => row.id === "form:t")!
      .summary,
    /1 wins, 0 losses/,
  );
  assert.doesNotMatch(
    JSON.stringify(prepared.facts),
    /private@example|owing|"homeScore":99/,
  );
});

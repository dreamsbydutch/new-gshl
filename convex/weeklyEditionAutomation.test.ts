import assert from "node:assert/strict";
import { test } from "node:test";
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

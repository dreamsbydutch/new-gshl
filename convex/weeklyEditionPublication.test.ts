import assert from "node:assert/strict";
import { test } from "node:test";
import type { Id } from "./_generated/dataModel";
import type { WeeklyEditionFactPacket } from "../src/lib/types";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import {
  publishTemplateEdition,
  type EditionPublicationSource,
} from "./lib/weeklyEditionPublication";
import {
  buildTemplateWeeklyEdition,
  hashWeeklyEditionSource,
} from "../src/lib/utils/features/weekly-edition";
import {
  generateHistorical,
  processGenerationJob,
  finalizeAiGeneration,
  updateManual,
  publishImport,
  restoreRevision,
  setVisibility,
  setHomeActive,
  setSectionActive,
} from "./weeklyEditions";

function fixture() {
  const f = mutationFixture();
  f.put("seasons", "season", {
    name: "Test season",
    year: 2020,
    isActive: true,
    startDate: "2020-01-01",
    endDate: "2020-01-31",
    signingEndDate: "2020-06-01",
    draftStartAt: "2020-09-01",
    categories: [],
    rosterSpots: [],
  });
  f.put("weeks", "week", {
    seasonId: "season",
    weekNum: 1,
    startDate: "2020-01-01",
    endDate: "2020-01-07",
    weekType: "RS",
  });
  f.put("teams", "team", {
    seasonId: "season",
    franchiseId: "franchise",
    confId: "conference",
  });
  f.put("franchises", "franchise", {
    name: "Aurora",
    abbr: "AUR",
    ownerId: "owner",
  });
  f.put("matchups", "matchup", {
    seasonId: "season",
    weekId: "week",
    homeTeamId: "team",
    awayTeamId: "other",
    homeScore: 5,
    awayScore: 4,
    isComplete: true,
    gameType: "CC",
  });
  f.put("playerWeekStatLines", "stats", {
    seasonId: "season",
    weekId: "week",
    playerId: "player",
    gshlTeamId: "team",
    Rating: 70,
    P: 10,
  });
  f.put("teamWeekStatLines", "teamstats", {
    seasonId: "season",
    weekId: "week",
    gshlTeamId: "team",
    Rating: 70,
  });
  return f;
}
function source(): EditionPublicationSource {
  const facts: WeeklyEditionFactPacket = {
    version: 1,
    season: { id: "season", name: "Test season", year: "2020" },
    week: {
      id: "week",
      number: 1,
      startDate: "2020-01-01",
      endDate: "2020-01-07",
    },
    teams: [],
    matchups: [],
    stars: [],
    powerMovers: [],
    activity: [],
    missedStarts: [],
    nextMatchups: [],
    editorialCandidates: [],
    issueType: "weekly",
    issueLabel: "Week 1",
  };
  return {
    seasonId: "season" as Id<"seasons">,
    weekId: "week" as Id<"weeks">,
    editionKey: "week:week",
    issueType: "weekly",
    issueLabel: "Week 1",
    seasonName: "Test season",
    weekNum: 1,
    startDate: Date.UTC(2020, 0, 1),
    endDate: Date.UTC(2020, 0, 7),
    scheduledFor: Date.UTC(2020, 0, 7),
    facts,
  };
}
async function published(f: ReturnType<typeof fixture>) {
  const request = source();
  const result = await publishTemplateEdition(f.ctx, request);
  assert.ok(result.existing);
  return {
    request,
    edition: result.existing,
    raw: JSON.stringify(buildTemplateWeeklyEdition(request.facts)),
  };
}

void test("publication interface shares unchanged/protection rules and snapshots replacements", async () => {
  const f = fixture();
  const { request, edition } = await published(f);
  assert.equal(
    (await publishTemplateEdition(f.ctx, request)).state,
    "unchanged",
  );
  assert.equal(f.rows("weeklyEditionRevisions").length, 0);
  await f.ctx.db.patch(edition._id, {
    generationMode: "manual",
    status: "hidden",
    isHomeActive: false,
  });
  const changed = {
    ...request,
    facts: { ...request.facts, issueLabel: "Changed facts" },
  };
  assert.equal(
    (await publishTemplateEdition(f.ctx, changed)).state,
    "protected",
  );
  assert.equal(f.rows("weeklyEditionRevisions").length, 0);
  assert.equal(
    (await publishTemplateEdition(f.ctx, changed, { replaceEditorial: true }))
      .state,
    "updated",
  );
  assert.equal(f.rows("weeklyEditionRevisions")[0]?.generationMode, "manual");
  assert.equal(f.get(edition._id)?.publishedAt, edition.publishedAt);
  assert.equal(f.get(edition._id)?.status, "published");
});

void test("weekly historical and scheduled callers refresh facts but protect editorial content", async () => {
  const f = fixture();
  const args = { seasonId: "season", weekId: "week" };
  const generated = (await invokeMutation(generateHistorical, f.ctx, args)) as {
    state: string;
  };
  assert.equal(generated.state, "inserted");
  assert.equal(
    (
      (await invokeMutation(generateHistorical, f.ctx, args)) as {
        state: string;
      }
    ).state,
    "unchanged",
  );
  const row = f.rows("weeklyEditions")[0]!;
  await f.ctx.db.patch(row._id as Id<"weeklyEditions">, {
    generationMode: "manual",
  });
  f.get("stats")!.P = 99;
  assert.equal(
    (
      (await invokeMutation(generateHistorical, f.ctx, args)) as {
        state: string;
      }
    ).state,
    "protected",
  );
  f.put("jobRuns", "run", {
    status: "running",
    apply: true,
    args: { seasonId: "season" },
  });
  await invokeMutation(processGenerationJob, f.ctx, { runId: "run" });
  assert.equal(f.get(row._id)?.generationMode, "manual");
  assert.equal(
    (
      (await invokeMutation(generateHistorical, f.ctx, {
        ...args,
        replaceEditorial: true,
      })) as { state: string }
    ).state,
    "updated",
  );
  assert.equal(
    f.rows("weeklyEditionRevisions").filter((r) => r.editionId === row._id)
      .length,
    1,
  );
});

void test("milestone scheduled snapshots stay fixed while historical refresh is explicit", async () => {
  const f = fixture();
  const args = {
    seasonId: "season",
    weekId: "week",
    issueType: "resigning_outlook",
  };
  assert.equal(
    (
      (await invokeMutation(generateHistorical, f.ctx, args)) as {
        state: string;
      }
    ).state,
    "inserted",
  );
  const row = f.rows("weeklyEditions")[0]!;
  const oldHash = row.sourceHash;
  f.get("franchise")!.name = "Renamed Aurora";
  f.put("jobRuns", "run", {
    status: "running",
    apply: true,
    args: { seasonId: "season" },
  });
  await invokeMutation(processGenerationJob, f.ctx, { runId: "run" });
  assert.equal(f.get(row._id)?.sourceHash, oldHash);
  assert.equal(
    (
      (await invokeMutation(generateHistorical, f.ctx, args)) as {
        state: string;
      }
    ).state,
    "updated",
  );
  assert.notEqual(f.get(row._id)?.sourceHash, oldHash);
});

void test("manual/import/restore callers preserve revision history and visibility differences", async () => {
  const f = fixture();
  const { edition, raw } = await published(f);
  await invokeMutation(setVisibility, f.ctx, {
    editionId: edition._id,
    status: "hidden",
  });
  const content: unknown = JSON.parse(raw);
  await invokeMutation(updateManual, f.ctx, {
    editionId: edition._id,
    content,
  });
  assert.equal(f.get(edition._id)?.status, "hidden");
  assert.equal(f.get(edition._id)?.generationMode, "manual");
  assert.equal(f.rows("weeklyEditionRevisions").length, 1);
  await invokeMutation(publishImport, f.ctx, { editionId: edition._id, raw });
  assert.equal(f.get(edition._id)?.status, "published");
  assert.equal(f.get(edition._id)?.generationMode, "chatgpt_import");
  const revision = f.rows("weeklyEditionRevisions")[0]!;
  await invokeMutation(restoreRevision, f.ctx, { revisionId: revision._id });
  assert.equal(f.get(edition._id)?.generationMode, "template");
  assert.equal(f.rows("weeklyEditionRevisions").length, 3);
});

void test("invalid editorial writes and unauthorized callers make no revisions or changes", async () => {
  const f = fixture();
  const { edition } = await published(f);
  const before = structuredClone(f.get(edition._id));
  await assert.rejects(
    invokeMutation(updateManual, f.ctx, {
      editionId: edition._id,
      content: {},
    }),
  );
  await assert.rejects(
    invokeMutation(publishImport, f.ctx, {
      editionId: edition._id,
      raw: "not JSON",
    }),
  );
  f.signIn(null);
  await assert.rejects(
    invokeMutation(generateHistorical, f.ctx, {
      seasonId: "season",
      weekId: "week",
    }),
    /Unauthenticated/,
  );
  await assert.rejects(
    invokeMutation(setVisibility, f.ctx, {
      editionId: edition._id,
      status: "hidden",
    }),
    /Unauthenticated/,
  );
  assert.deepEqual(f.get(edition._id), before);
  assert.equal(f.rows("weeklyEditionRevisions").length, 0);
});

void test("AI finalization checks fact integrity, concurrent edits, identity and current commissioner before writes", async () => {
  const f = fixture();
  const { request, edition, raw } = await published(f);
  const args = {
    ...request,
    raw,
    sourceHash: hashWeeklyEditionSource(request.facts),
    editedBy: "commissioner",
    existingEditionId: edition._id,
    expectedUpdatedAt: edition.updatedAt,
  };
  const before = structuredClone(f.get(edition._id));
  for (const change of [
    { sourceHash: "bad" },
    { expectedUpdatedAt: 0 },
    { editionKey: "wrong" },
    { existingEditionId: "missing" },
    { existingEditionId: undefined },
    { raw: "invalid" },
  ]) {
    await assert.rejects(
      invokeMutation(finalizeAiGeneration, f.ctx, { ...args, ...change }),
    );
    assert.deepEqual(f.get(edition._id), before);
    assert.equal(f.rows("weeklyEditionRevisions").length, 0);
  }
  f.get("commissioner")!.role = "owner";
  await assert.rejects(
    invokeMutation(finalizeAiGeneration, f.ctx, args),
    /Forbidden/,
  );
  f.get("commissioner")!.role = "commissioner";
  await invokeMutation(finalizeAiGeneration, f.ctx, args);
  assert.equal(f.get(edition._id)?.generationMode, "openai");
  assert.equal(f.rows("weeklyEditionRevisions").length, 1);
  assert.equal(f.get(edition._id)?.raw, undefined);
});

void test("presentation callers enforce publication and section rules without content revisions", async () => {
  const f = fixture();
  const { edition } = await published(f);
  const firstSection = buildTemplateWeeklyEdition(source().facts).sections[0]!;
  await invokeMutation(setHomeActive, f.ctx, { editionId: edition._id });
  assert.equal(f.get(edition._id)?.isHomeActive, true);
  await invokeMutation(setSectionActive, f.ctx, {
    editionId: edition._id,
    sectionId: firstSection.id,
    active: false,
  });
  assert.deepEqual(f.get(edition._id)?.inactiveSectionIds, [firstSection.id]);
  await assert.rejects(
    invokeMutation(setSectionActive, f.ctx, {
      editionId: edition._id,
      sectionId: "missing",
      active: false,
    }),
    /Article not found/,
  );
  await invokeMutation(setVisibility, f.ctx, {
    editionId: edition._id,
    status: "hidden",
  });
  assert.equal(f.get(edition._id)?.isHomeActive, false);
  await assert.rejects(
    invokeMutation(setHomeActive, f.ctx, { editionId: edition._id }),
    /Only a published/,
  );
  assert.equal(f.rows("weeklyEditionRevisions").length, 0);
});

void test("AI insertion publishes once and a subsequent manual edit invalidates its prepared snapshot", async () => {
  const f = fixture();
  const request = source();
  const args = {
    ...request,
    sourceHash: hashWeeklyEditionSource(request.facts),
    raw: JSON.stringify(buildTemplateWeeklyEdition(request.facts)),
    editedBy: "commissioner",
  };
  await invokeMutation(finalizeAiGeneration, f.ctx, args);
  const row = f.rows("weeklyEditions")[0]!;
  assert.equal(row.generationMode, "openai");
  assert.equal(f.rows("weeklyEditionRevisions").length, 0);
  await assert.rejects(
    invokeMutation(finalizeAiGeneration, f.ctx, args),
    /changed while OpenAI/,
  );
  await f.ctx.db.patch(row._id as Id<"weeklyEditions">, { updatedAt: 1 });
  const prepared = {
    ...args,
    existingEditionId: row._id,
    expectedUpdatedAt: 1,
  };
  await invokeMutation(updateManual, f.ctx, {
    editionId: row._id,
    content: buildTemplateWeeklyEdition(request.facts),
  });
  const manual = structuredClone(f.get(row._id));
  await assert.rejects(
    invokeMutation(finalizeAiGeneration, f.ctx, prepared),
    /changed while OpenAI/,
  );
  assert.deepEqual(f.get(row._id), manual);
  assert.equal(f.rows("weeklyEditionRevisions").length, 1);
});

void test("milestone interface skips unchanged snapshots before schedule validation", async () => {
  const f = fixture();
  const request = {
    ...source(),
    issueType: "resigning_outlook" as const,
    editionKey: "milestone:resigning_outlook",
  };
  await publishTemplateEdition(f.ctx, request);
  const changed = {
    ...request,
    startDate: null,
    facts: { ...request.facts, issueLabel: "Refreshed" },
  };
  assert.equal(
    (await publishTemplateEdition(f.ctx, changed)).state,
    "unchanged",
  );
  await assert.rejects(
    publishTemplateEdition(f.ctx, changed, { refreshSource: true }),
    /invalid date/,
  );
  assert.equal(f.rows("weeklyEditionRevisions").length, 0);
});

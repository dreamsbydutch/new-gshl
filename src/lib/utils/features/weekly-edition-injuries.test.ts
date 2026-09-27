import assert from "node:assert/strict";
import { test } from "node:test";
import type { WeeklyEditionFactPacket } from "../../types/weekly-edition";
import type { EditionInjuryContext } from "../../types/weekly-edition-injuries";
import type { InjuryReport } from "../../types/injuries";
import { enrichEditionWithInjuries } from "./weekly-edition-injuries";
import { addEditionInjuryReporting } from "../../../../convex/lib/weeklyEditionInjuries";

const packet: WeeklyEditionFactPacket = {
  version: 1,
  season: { id: "s", name: "Season", year: "2026" },
  week: { id: "w", number: 1, startDate: "2026-09-20", endDate: "2026-09-26" },
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
const context: EditionInjuryContext = {
  previous: null,
  players: [
    {
      playerId: "p",
      name: "Test Player",
      nhlTeams: ["TOR"],
      teamId: "t",
      teamName: "GSHL Club",
      rating: 90,
      latestPlayedDate: null,
    },
  ],
};
const report: InjuryReport = {
  fetchedAt: Date.parse("2026-09-27T12:00Z"),
  sourceUpdatedAt: "2026-09-27T12:00Z",
  injuries: [
    {
      id: "injury",
      name: "Test Player",
      team: "TOR",
      status: "Injured Reserve",
      designation: "IR",
      description: "Upper Body",
      comment: "Expected to miss time",
      updatedAt: "2026-09-26T12:00Z",
      returnDate: "2026-10-15",
    },
  ],
};

void test("major absence becomes team evidence with rating context, not a rating deduction", () => {
  const result = enrichEditionWithInjuries(packet, context, report);
  assert.equal(result.editorialCandidates[0]?.teamId, "t");
  assert.equal(result.editorialCandidates[0]?.kind, "injury");
  assert.equal(result.editorialCandidates[0]?.metrics[0]?.value, 90);
  assert.match(
    result.editorialCandidates[0].summary,
    /first available observation/,
  );
  assert.equal(packet.editorialCandidates.length, 0);
});

void test("unchanged injuries are tracked but not pitched again", () => {
  const first = enrichEditionWithInjuries(packet, context, report);
  const next = enrichEditionWithInjuries(
    packet,
    { ...context, previous: first.injurySnapshot! },
    { ...report, fetchedAt: report.fetchedAt + 86400000 },
  );
  assert.equal(next.editorialCandidates.length, 0);
  assert.equal(next.injurySnapshot?.observations.length, 1);
});

void test("a changed return estimate produces fresh evidence without claiming recovery", () => {
  const first = enrichEditionWithInjuries(packet, context, report);
  const result = enrichEditionWithInjuries(
    packet,
    { ...context, previous: first.injurySnapshot! },
    {
      ...report,
      fetchedAt: report.fetchedAt + 86400000,
      injuries: [{ ...report.injuries[0]!, returnDate: "2026-11-01" }],
    },
  );
  assert.equal(result.editorialCandidates.length, 1);
  assert.match(
    result.editorialCandidates[0]!.summary,
    /Estimated return: 2026-11-01/,
  );
  assert.doesNotMatch(
    result.editorialCandidates[0]!.summary,
    /recorded an NHL appearance/,
  );
});

void test("missing from ESPN alone is not a return; later recorded appearance is", () => {
  const first = enrichEditionWithInjuries(packet, context, report);
  const nextContext = { ...context, previous: first.injurySnapshot! };
  const nextReport = {
    ...report,
    fetchedAt: report.fetchedAt + 2 * 86400000,
    injuries: [],
  };
  const missing = enrichEditionWithInjuries(packet, nextContext, nextReport);
  assert.equal(missing.editorialCandidates.length, 0);
  assert.equal(missing.injurySnapshot?.observations.length, 1);
  const played = enrichEditionWithInjuries(
    packet,
    {
      ...nextContext,
      players: [{ ...context.players[0]!, latestPlayedDate: "2026-09-28" }],
    },
    nextReport,
  );
  assert.match(
    played.editorialCandidates[0]!.summary,
    /recorded an NHL appearance/,
  );
  assert.equal(played.injurySnapshot?.observations.length, 0);
  const oldAppearance = enrichEditionWithInjuries(
    packet,
    {
      ...nextContext,
      players: [{ ...context.players[0]!, latestPlayedDate: "2026-09-26" }],
    },
    nextReport,
  );
  assert.equal(oldAppearance.editorialCandidates.length, 0);
});

void test("minor injuries, unmatched identities and historical issues do not create major stories", () => {
  assert.equal(
    enrichEditionWithInjuries(packet, context, {
      ...report,
      injuries: [
        { ...report.injuries[0]!, designation: "DTD", status: "Day-To-Day" },
      ],
    }).editorialCandidates.length,
    0,
  );
  assert.equal(
    enrichEditionWithInjuries(
      packet,
      { ...context, players: [...context.players, ...context.players] },
      report,
    ).editorialCandidates.length,
    0,
  );
  const historical = {
    ...packet,
    week: { ...packet.week, endDate: "2025-09-26" },
  };
  assert.equal(
    enrichEditionWithInjuries(historical, context, report),
    historical,
  );
});

void test("failed feed retains the baseline without generating recovery evidence", async (t) => {
  const first = enrichEditionWithInjuries(packet, context, report);
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("unavailable", { status: 503 }),
  );
  const result = await addEditionInjuryReporting(packet, {
    ...context,
    previous: first.injurySnapshot!,
  });
  assert.deepEqual(result.injurySnapshot, first.injurySnapshot);
  assert.equal(result.editorialCandidates.length, 0);
});

void test("stale source data is not treated as a current absence or recovery", async (t) => {
  const first = enrichEditionWithInjuries(packet, context, report);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      status: "success",
      timestamp: "2000-01-01T00:00:00Z",
      injuries: [],
    }),
  );
  const result = await addEditionInjuryReporting(packet, {
    ...context,
    previous: first.injurySnapshot!,
  });
  assert.deepEqual(result.injurySnapshot, first.injurySnapshot);
  assert.equal(result.editorialCandidates.length, 0);
});

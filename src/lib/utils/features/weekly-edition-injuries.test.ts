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

void test("a recent newly observed major absence carries internal rating context at supporting priority", () => {
  const result = enrichEditionWithInjuries(
    packet,
    {
      ...context,
      previous: {
        fetchedAt: report.fetchedAt - 2 * 86400000,
        sourceUpdatedAt: "2026-09-25T12:00Z",
        observations: [],
      },
    },
    report,
  );
  assert.equal(result.editorialCandidates[0]?.teamId, "t");
  assert.equal(result.editorialCandidates[0]?.kind, "injury");
  assert.equal(result.editorialCandidates[0]?.metrics[0]?.value, 90);
  assert.match(result.editorialCandidates[0].summary, /newly observed/);
  assert.equal(result.editorialCandidates[0]?.importance, 65);
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

void test("a changed distant return estimate does not become a story", () => {
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
  assert.equal(result.editorialCandidates.length, 0);
  assert.equal(
    result.injurySnapshot?.observations[0]?.returnDate,
    "2026-11-01",
  );
});

void test("first observations and feed refreshes do not prove a recent injury", () => {
  assert.equal(
    enrichEditionWithInjuries(packet, context, report).editorialCandidates
      .length,
    0,
  );
  const first = enrichEditionWithInjuries(packet, context, report);
  const refreshed = enrichEditionWithInjuries(
    packet,
    { ...context, previous: first.injurySnapshot! },
    {
      ...report,
      fetchedAt: report.fetchedAt + 86400000,
      sourceUpdatedAt: "2026-09-28T12:00Z",
      injuries: [
        {
          ...report.injuries[0]!,
          updatedAt: "2026-09-28T12:00Z",
          description: "Updated description",
        },
      ],
    },
  );
  assert.equal(refreshed.editorialCandidates.length, 0);
  for (const updatedAt of [null, "invalid", "2026-06-01", "2026-10-15"]) {
    assert.equal(
      enrichEditionWithInjuries(
        packet,
        {
          ...context,
          previous: { ...first.injurySnapshot!, observations: [] },
        },
        {
          ...report,
          fetchedAt: report.fetchedAt + 86400000,
          injuries: [{ ...report.injuries[0]!, updatedAt }],
        },
      ).editorialCandidates.length,
      0,
    );
  }
});

void test("an old absence can become relevant for a near-term return, without repeating it", () => {
  const near = {
    ...report,
    injuries: [
      {
        ...report.injuries[0]!,
        updatedAt: "2026-06-01",
        returnDate: "2026-09-30",
      },
    ],
  };
  const first = enrichEditionWithInjuries(packet, context, near);
  assert.equal(first.editorialCandidates.length, 1);
  assert.match(
    first.editorialCandidates[0]!.summary,
    /outlook, not a confirmed return/,
  );
  assert.equal(
    enrichEditionWithInjuries(
      packet,
      { ...context, previous: first.injurySnapshot! },
      { ...near, fetchedAt: report.fetchedAt + 86400000 },
    ).editorialCandidates.length,
    0,
  );
  const later = {
    ...report,
    injuries: [{ ...report.injuries[0]!, returnDate: "2026-10-05" }],
  };
  const before = enrichEditionWithInjuries(packet, context, later);
  assert.equal(before.editorialCandidates.length, 0);
  const enteredWindow = enrichEditionWithInjuries(
    packet,
    { ...context, previous: before.injurySnapshot! },
    { ...later, fetchedAt: report.fetchedAt + 86400000 },
  );
  assert.equal(enteredWindow.editorialCandidates.length, 1);
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

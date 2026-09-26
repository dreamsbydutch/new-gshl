import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { getFunctionName } from "convex/server";
import { generateWithAi } from "./weeklyEditions";
import {
  buildWeeklyEditionAuthorRoster,
  selectWeeklyEditionStoryAssignments,
  hashWeeklyEditionSource,
} from "../src/lib/utils/features/weekly-edition-editorial-policy";
import type {
  WeeklyEditionContent,
  WeeklyEditionFactPacket,
  WeeklyEditionStorySubmission,
} from "../src/lib/types";

function writingFixture() {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    teamId: `team-${index}`,
    name: `Club ${index}`,
    abbr: `C${index}`,
    beatWriter: `Reporter ${index}`,
  }));
  const facts: WeeklyEditionFactPacket = {
    version: 1,
    season: { id: "s", name: "Test", year: "2025" },
    week: {
      id: "w",
      number: 1,
      startDate: "2025-10-01",
      endDate: "2025-10-07",
    },
    teams,
    matchups: [],
    stars: [],
    powerMovers: [],
    activity: [],
    missedStarts: [],
    nextMatchups: [],
    issueType: "weekly",
    issueLabel: "Week 1",
    editorialCandidates: teams.map((team) => ({
      id: `evidence:${team.teamId}`,
      kind: "team_performance",
      scope: "week",
      importance: 70,
      teamId: team.teamId,
      teamName: team.name,
      headlineHint: `${team.name} performance`,
      summary: `${team.name} played this week.`,
      metrics: [],
      links: [],
    })),
  };
  const submissions: WeeklyEditionStorySubmission[] =
    buildWeeklyEditionAuthorRoster(facts).map(({ author }) => ({
      author,
      pitches: author.teamId
        ? [
            {
              pitchId: author.teamId,
              leadCandidateId: `evidence:${author.teamId}`,
              supportingCandidateIds: [],
              proposedHeadline: `${author.teamName} performance`,
              angle: "Examine this week's performance.",
              scores: {
                consequence: 3,
                readerInterest: 3,
                evidenceStrength: 5,
                freshness: 4,
              },
            },
          ]
        : [],
    }));
  const assignments = selectWeeklyEditionStoryAssignments(facts, submissions);
  const content: WeeklyEditionContent = {
    headline: "This week around the league",
    deck: "A look at the clubs in the latest week of league competition.",
    sections: assignments.map((assignment) => ({
      id: assignment.id,
      kind: assignment.kind,
      author: assignment.author,
      eyebrow: "On the beat",
      headline: `${assignment.author.teamName} in focus`,
      body: `${assignment.author.teamName} played this week. The recorded performance provides the starting point for this report.`,
      links: [],
    })),
  };
  return { facts, submissions, content };
}

void test("previous coverage moves unchanged evidence behind fresh front-page stories", () => {
  const { facts, submissions } = writingFixture();
  const previousLead = selectWeeklyEditionStoryAssignments(
    facts,
    submissions,
  )[0]!.leadCandidateId;
  const lead = facts.editorialCandidates.find(
    (candidate) => candidate.id === previousLead,
  )!;
  facts.research = {
    asOf: "2025-10-07",
    analysisSeasonId: "s",
    coverage: [],
    limitations: [],
    owners: [],
    recentCoverage: [
      {
        editionId: "earlier",
        headline: "Earlier coverage",
        headlines: [],
        evidenceHashes: [hashWeeklyEditionSource(lead)],
      },
    ],
  };
  assert.notEqual(
    selectWeeklyEditionStoryAssignments(facts, submissions)[0]!.leadCandidateId,
    previousLead,
  );
});

void test("AI pipeline reviews corrected copy and never publishes unresolved editorial issues", async () => {
  const prior = process.env.OPENAI_API_KEY;
  const priorModel = process.env.OPENAI_NEWSROOM_MODEL;
  delete process.env.OPENAI_NEWSROOM_MODEL;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    for (const resolves of [true, false]) {
      const expectedModel = resolves ? "gpt-5.6-terra" : "gpt-5.6-sol";
      const { facts, submissions, content } = writingFixture();
      let reviews = 0;
      let publications = 0;
      const requests: string[] = [];
      const fetchMock = mock.method(
        globalThis,
        "fetch",
        async (_url: unknown, init: RequestInit) => {
          if (typeof init.body !== "string")
            throw new Error("Expected a JSON request body");
          const request = JSON.parse(init.body) as {
            model: string;
            text: { format: { name: string } };
          };
          assert.equal(request.model, expectedModel);
          const name = request.text.format.name;
          requests.push(name);
          let result: unknown;
          if (name === "gshl_newsroom_pitches") result = { submissions };
          else if (name === "gshl_weekly_edition") result = content;
          else {
            reviews++;
            result = {
              reviewedArticleIds: [
                "front_page",
                ...content.sections.map((section) => section.id),
              ],
              issues:
                resolves && reviews === 2
                  ? []
                  : [
                      {
                        articleId: "article_1",
                        detail: "The article contains an unsupported claim.",
                      },
                    ],
            };
          }
          return new Response(
            JSON.stringify({
              status: "completed",
              output_text: JSON.stringify(result),
            }),
            { status: 200 },
          );
        },
      );
      try {
        const run = (
          generateWithAi as unknown as {
            _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
          }
        )._handler(
          {
            runQuery: async () => ({ userId: "commissioner" }),
            runMutation: async (
              fn: Parameters<typeof getFunctionName>[0],
              args: { seasonSelection?: string },
            ) => {
              if (
                getFunctionName(fn) === "weeklyEditions:prepareAiGeneration"
              ) {
                assert.equal(args.seasonSelection, "edition");
                return { facts, seasonId: "s", weekId: "w" };
              }
              publications++;
              return { id: "edition" };
            },
          },
          {
            seasonId: "s",
            weekId: "w",
            issueType: "weekly",
            ...(resolves ? {} : { model: expectedModel }),
          },
        );
        if (resolves) await run;
        else await assert.rejects(run, /unsupported claim/);
        assert.equal(publications, resolves ? 1 : 0);
        assert.deepEqual(requests, [
          "gshl_newsroom_pitches",
          "gshl_weekly_edition",
          "gshl_editorial_review",
          "gshl_weekly_edition",
          "gshl_editorial_review",
        ]);
      } finally {
        fetchMock.mock.restore();
      }
    }
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
    if (priorModel === undefined) delete process.env.OPENAI_NEWSROOM_MODEL;
    else process.env.OPENAI_NEWSROOM_MODEL = priorModel;
  }
});

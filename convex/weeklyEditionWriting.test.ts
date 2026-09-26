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
  return { facts, submissions, content, assignments };
}

void test("unsubstantiated copy-editor objections do not rewrite or block a grounded preview", async () => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  const { facts, submissions, content } = writingFixture();
  let writes = 0;
  let confirmations = 0;
  let publications = 0;
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      if (typeof init.body !== "string") throw new Error("Expected JSON");
      const request = JSON.parse(init.body) as {
        text: { format: { name: string } };
      };
      let result: unknown;
      switch (request.text.format.name) {
        case "gshl_newsroom_pitches":
          result = { submissions };
          break;
        case "gshl_weekly_edition":
          writes++;
          result = content;
          break;
        case "gshl_editorial_verdicts":
          confirmations++;
          result = {
            verdicts: [
              {
                issueIndex: 0,
                decision: "dismiss",
                reason: "3.7 million and 3,700,000 are equivalent amounts.",
              },
            ],
          };
          break;
        default:
          result = {
            reviewedArticleIds: [
              "front_page",
              ...content.sections.map((s) => s.id),
            ],
            replacementArticleIds: [],
            issues: [
              {
                articleId: "article_1",
                detail: '"3.7 million in cap space" should be 3,700,000.',
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
    await (
      generateWithAi as unknown as {
        _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
      }
    )._handler(
      {
        runQuery: async () => ({ userId: "commissioner" }),
        runMutation: async (
          fn: Parameters<typeof getFunctionName>[0],
          args: { raw: string },
        ) => {
          if (getFunctionName(fn) === "weeklyEditions:prepareAiGeneration")
            return { facts, seasonId: "s", weekId: "w" };
          publications++;
          assert.deepEqual(JSON.parse(args.raw), content);
          return { id: "edition" };
        },
      },
      { seasonId: "s", weekId: "w", issueType: "weekly" },
    );
    assert.equal(writes, 1);
    assert.equal(confirmations, 1);
    assert.equal(publications, 1);
  } finally {
    fetchMock.mock.restore();
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorKey;
  }
});

void test("duplicate stories reopen the affected assignment before a reviewed replacement is published", async () => {
  for (const initialCopyError of [false, true]) {
    const priorKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only";
    const { facts, submissions, content, assignments } = writingFixture();
    facts.research = {
      asOf: "2025-10-07",
      analysisSeasonId: "s",
      coverage: [],
      limitations: [],
      owners: [],
      recentCoverage: [],
    };
    const replaced = assignments[7]!;
    const oldLead = facts.editorialCandidates.find(
      (c) => c.id === replaced.leadCandidateId,
    )!;
    facts.editorialCandidates.push({
      ...oldLead,
      id: "different-evidence",
      summary: "A distinct upcoming matchup",
      headlineHint: "A distinct upcoming matchup",
    });
    const revisedSubmissions = submissions.map((s) => ({
      ...s,
      pitches: s.pitches.map((p) =>
        p.leadCandidateId === replaced.leadCandidateId
          ? {
              ...p,
              pitchId: "replacement",
              leadCandidateId: "different-evidence",
              proposedHeadline: "A distinct upcoming matchup",
              angle:
                "Cover the upcoming matchup instead of repeating the return story.",
            }
          : p,
      ),
    }));
    let pitches = 0;
    let writes = 0;
    let reviews = 0;
    let publications = 0;
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (_url: unknown, init: RequestInit) => {
        assert.equal(typeof init.body, "string");
        const request = JSON.parse(init.body as string) as {
          input: string;
          text: { format: { name: string } };
        };
        let result: unknown;
        if (request.text.format.name === "gshl_newsroom_pitches") {
          pitches++;
          if (pitches > 1)
            assert.match(request.input, /STORY_REASSIGNMENT_REQUIRED/);
          result = {
            submissions: pitches === 1 ? submissions : revisedSubmissions,
          };
        } else if (request.text.format.name === "gshl_weekly_edition") {
          writes++;
          if (writes > 1) assert.match(request.input, /different-evidence/);
          result = {
            ...content,
            sections: content.sections.map((s) =>
              s.id === replaced.id && pitches > 1
                ? {
                    ...s,
                    headline: "A distinct upcoming matchup",
                    body: `${s.author?.teamName} has an upcoming matchup. This article covers that matchup using the new evidence.`,
                  }
                : pitches > 1
                  ? {
                      ...s,
                      body: "Unrequested rewrite that the server must discard.",
                    }
                  : s,
            ),
          };
          if (initialCopyError && writes === 1) result = {};
        } else if (request.text.format.name === "gshl_editorial_verdicts") {
          result = {
            verdicts: [
              {
                issueIndex: 0,
                decision: "replace_story",
                reason:
                  "The two articles repeat the same development and evidence.",
              },
            ],
          };
        } else {
          reviews++;
          const duplicate = pitches === 1;
          result = {
            reviewedArticleIds: [
              "front_page",
              ...content.sections.map((s) => s.id),
            ],
            issues: duplicate
              ? [
                  {
                    articleId: replaced.id,
                    detail:
                      "Substantially duplicates article_3 under a different headline.",
                  },
                ]
              : [],
            replacementArticleIds: duplicate ? [replaced.id] : [],
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
      await (
        generateWithAi as unknown as {
          _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
        }
      )._handler(
        {
          runQuery: async () => ({ userId: "commissioner" }),
          runMutation: async (
            fn: Parameters<typeof getFunctionName>[0],
            args: { raw: string; facts: WeeklyEditionFactPacket },
          ) => {
            if (getFunctionName(fn) === "weeklyEditions:prepareAiGeneration")
              return { facts, seasonId: "s", weekId: "w" };
            publications++;
            const published = JSON.parse(args.raw) as WeeklyEditionContent;
            assert.equal(
              published.sections[7]?.headline,
              "A distinct upcoming matchup",
            );
            assert.deepEqual(
              published.sections.slice(0, 7),
              content.sections.slice(0, 7),
            );
            assert.equal(
              args.facts.research?.assignments?.[7]?.leadCandidateId,
              "different-evidence",
            );
            return { id: "edition" };
          },
        },
        { seasonId: "s", weekId: "w", issueType: "weekly" },
      );
      assert.equal(pitches, 2);
      assert.equal(reviews, 2);
      assert.equal(writes, initialCopyError ? 3 : 2);
      assert.equal(publications, 1);
    } finally {
      fetchMock.mock.restore();
      if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = priorKey;
    }
  }
});

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

void test("generation stops before another model request when its total time budget expires", async () => {
  const priorKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  const { facts, submissions } = writingFixture();
  let now = 0;
  let calls = 0;
  const clockMock = mock.method(Date, "now", () => now);
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    calls++;
    now = 8 * 60_000 + 1;
    return new Response(
      JSON.stringify({
        status: "completed",
        output_text: JSON.stringify({ submissions }),
      }),
      { status: 200 },
    );
  });
  try {
    await assert.rejects(
      (
        generateWithAi as unknown as {
          _handler: (ctx: unknown, args: unknown) => Promise<unknown>;
        }
      )._handler(
        {
          runQuery: async () => ({ userId: "commissioner" }),
          runMutation: async (fn: Parameters<typeof getFunctionName>[0]) => {
            assert.equal(
              getFunctionName(fn),
              "weeklyEditions:prepareAiGeneration",
            );
            return { facts, seasonId: "s", weekId: "w" };
          },
        },
        { seasonId: "s", weekId: "w", issueType: "weekly" },
      ),
      /generation time limit/,
    );
    assert.equal(calls, 1);
  } finally {
    clockMock.mock.restore();
    fetchMock.mock.restore();
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorKey;
  }
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
          else if (name === "gshl_editorial_verdicts")
            result = {
              verdicts: [
                {
                  issueIndex: 0,
                  decision: "correct_copy",
                  reason: "The factual assertion has no supporting evidence.",
                },
              ],
            };
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
          "gshl_editorial_verdicts",
          "gshl_weekly_edition",
          "gshl_editorial_review",
          ...(!resolves
            ? [
                "gshl_editorial_verdicts",
                "gshl_weekly_edition",
                "gshl_editorial_review",
                "gshl_editorial_verdicts",
              ]
            : []),
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

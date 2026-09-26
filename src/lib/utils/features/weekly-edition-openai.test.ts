import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyEditionOpenAiRequest,
  buildWeeklyEditionPitchOpenAiRequest,
  extractWeeklyEditionOpenAiText,
  parseWeeklyEditionStorySubmissions,
  parseWeeklyEditionReview,
  parseWeeklyEditionEditorialReview,
  applyWeeklyEditionReviewVerdicts,
  resolveNewsroomModel,
} from "./weekly-edition-openai";
import {
  buildWeeklyEditionArticleSlots,
  parseWeeklyEditionArticleCount,
} from "./weekly-edition-articles";

void test("Newsroom uses Terra by default and an explicit selection overrides deployment configuration", () => {
  assert.equal(resolveNewsroomModel(), "gpt-5.6-terra");
  assert.equal(resolveNewsroomModel("", "  "), "gpt-5.6-terra");
  assert.equal(
    resolveNewsroomModel(undefined, "custom-deployment-model"),
    "custom-deployment-model",
  );
  assert.equal(
    resolveNewsroomModel("gpt-5.6-terra", "gpt-5-mini"),
    "gpt-5.6-terra",
  );
  assert.equal(resolveNewsroomModel("gpt-5.6-sol"), "gpt-5.6-sol");
  for (const model of [
    "gpt-5-mini",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.4",
  ]) {
    assert.equal(resolveNewsroomModel(model, "gpt-5.6-terra"), model);
  }
  assert.throws(
    () => resolveNewsroomModel("arbitrary-client-model"),
    /supported Newsroom model/,
  );
});

void test("incomplete model output is rejected even when it contains parseable JSON", () => {
  assert.throws(
    () =>
      extractWeeklyEditionOpenAiText({
        status: "incomplete",
        output_text: '{"headline":"Partial"}',
      }),
    /did not complete/,
  );
  assert.throws(
    () =>
      extractWeeklyEditionOpenAiText({ status: "failed", output_text: "{}" }),
    /did not complete/,
  );
});

void test("editorial review must cover the front page and every article", () => {
  const content = {
    headline: "Test",
    deck: "Test",
    sections: [
      {
        id: "article_1",
        kind: "primary_article" as const,
        eyebrow: "Test",
        headline: "Test",
        body: "Test",
        links: [],
      },
    ],
  };
  assert.throws(
    () =>
      parseWeeklyEditionReview(
        JSON.stringify({ reviewedArticleIds: ["article_1"], issues: [] }),
        content,
      ),
    /every article/,
  );
  assert.throws(
    () =>
      parseWeeklyEditionReview(
        JSON.stringify({
          reviewedArticleIds: ["front_page", "front_page"],
          issues: [],
        }),
        content,
      ),
    /every article/,
  );
  assert.deepEqual(
    parseWeeklyEditionReview(
      JSON.stringify({
        reviewedArticleIds: ["front_page", "article_1"],
        issues: [
          {
            articleId: "article_1",
            detail: "The quoted score has no supporting matchup.",
          },
        ],
      }),
      content,
    ),
    ["article_1: The quoted score has no supporting matchup."],
  );
  assert.deepEqual(
    parseWeeklyEditionEditorialReview(
      JSON.stringify({
        reviewedArticleIds: ["front_page", "article_1"],
        replacementArticleIds: ["article_1"],
        issues: [{ articleId: "article_1", detail: "Repeats another story." }],
      }),
      content,
    ).replacementArticleIds,
    ["article_1"],
  );
  for (const replacementArticleIds of [
    ["front_page"],
    ["missing"],
    ["article_1", "article_1"],
    ["article_1"],
  ]) {
    assert.throws(
      () =>
        parseWeeklyEditionEditorialReview(
          JSON.stringify({
            reviewedArticleIds: ["front_page", "article_1"],
            replacementArticleIds,
            issues: [],
          }),
          content,
        ),
      /invalid story replacement/,
    );
  }
  assert.deepEqual(
    parseWeeklyEditionReview(
      JSON.stringify({
        reviewedArticleIds: ["front_page", "article_1"],
        issues: [],
      }),
      content,
    ),
    [],
  );
});

void test("newsletter article counts accept six through ten", () => {
  assert.equal(parseWeeklyEditionArticleCount("8"), 8);
  assert.equal(buildWeeklyEditionArticleSlots(10).at(-1)?.id, "article_10");
  assert.throws(() => parseWeeklyEditionArticleCount(5), /between 6 and 10/i);
  assert.throws(() => parseWeeklyEditionArticleCount(11), /between 6 and 10/i);
});

void test("verification dismisses false alarms without losing factual corrections or retaining dismissed replacements", () => {
  const issues = [
    { articleId: "article_1", detail: "This repeats another article." },
    {
      articleId: "article_1",
      detail: "The cap amount contradicts the source.",
    },
    {
      articleId: "article_2",
      detail:
        "The opener will reveal whether the core is enough is a forecast.",
    },
  ];
  const review = {
    issues,
    errors: issues.map((issue) => `${issue.articleId}: ${issue.detail}`),
    affectedArticleIds: ["article_1", "article_2"],
    replacementArticleIds: ["article_1"],
  };
  const verdicts = [
    {
      issueIndex: 2,
      decision: "dismiss",
      reason: "Grounded preview analysis is permitted.",
    },
    {
      issueIndex: 0,
      decision: "dismiss",
      reason: "Shared context supports distinct developments.",
    },
    {
      issueIndex: 1,
      decision: "correct_copy",
      reason: "The article's amount differs from the source.",
    },
  ];
  const result = applyWeeklyEditionReviewVerdicts(
    JSON.stringify({ verdicts }),
    review,
  );
  assert.deepEqual(result.issues, [issues[1]]);
  assert.deepEqual(result.errors, [
    "article_1: The cap amount contradicts the source.",
  ]);
  assert.deepEqual(result.affectedArticleIds, ["article_1"]);
  assert.deepEqual(result.replacementArticleIds, []);
  assert.deepEqual(
    applyWeeklyEditionReviewVerdicts(
      JSON.stringify({
        verdicts: verdicts.map((v) =>
          v.issueIndex === 0 ? { ...v, decision: "replace_story" } : v,
        ),
      }),
      review,
    ).replacementArticleIds,
    ["article_1"],
  );
  for (const invalid of [
    [],
    verdicts.slice(1),
    [verdicts[0], verdicts[0], verdicts[2]],
    verdicts.map((v) => (v.issueIndex === 2 ? { ...v, issueIndex: 3 } : v)),
  ]) {
    assert.throws(
      () =>
        applyWeeklyEditionReviewVerdicts(
          JSON.stringify({ verdicts: invalid }),
          review,
        ),
      /every issue exactly once/,
    );
  }
  assert.throws(
    () =>
      applyWeeklyEditionReviewVerdicts(
        JSON.stringify({
          verdicts: verdicts.map((v) =>
            v.issueIndex === 2 ? { ...v, decision: "replace_story" } : v,
          ),
        }),
        review,
      ),
    /unproposed story replacement/,
  );
});

void test("buildWeeklyEditionOpenAiRequest defaults to eight exact articles", () => {
  const request = buildWeeklyEditionOpenAiRequest({
    model: "gpt-test",
    prompt: "grounded prompt",
  });

  assert.equal(request.model, "gpt-test");
  assert.equal(request.store, false);
  assert.equal(request.input, "grounded prompt");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.properties.sections.minItems, 8);
  assert.equal(request.text.format.schema.properties.sections.maxItems, 8);
  assert.deepEqual(
    request.text.format.schema.properties.sections.items.properties.id.enum,
    [
      "article_1",
      "article_2",
      "article_3",
      "article_4",
      "article_5",
      "article_6",
      "article_7",
      "article_8",
    ],
  );
});

void test("buildWeeklyEditionOpenAiRequest uses the selected article count", () => {
  const request = buildWeeklyEditionOpenAiRequest({
    model: "gpt-test",
    prompt: "grounded prompt",
    articleCount: 10,
  });

  assert.equal(request.text.format.schema.properties.sections.minItems, 10);
  assert.equal(request.text.format.schema.properties.sections.maxItems, 10);
  assert.equal(
    request.text.format.schema.properties.sections.items.properties.id.enum.at(
      -1,
    ),
    "article_10",
  );
  assert.equal(request.max_output_tokens, 12000);
});

void test("buildWeeklyEditionPitchOpenAiRequest defines a bounded pitch desk", () => {
  const request = buildWeeklyEditionPitchOpenAiRequest({
    model: "gpt-test",
    prompt: "story ledger",
  });

  assert.equal(request.store, false);
  assert.equal(request.input, "story ledger");
  assert.equal(request.text.format.name, "gshl_newsroom_pitches");
  assert.equal(
    request.text.format.schema.properties.submissions.items.properties.pitches
      .maxItems,
    2,
  );
});

void test("parseWeeklyEditionStorySubmissions reads grounded writer pitches", () => {
  const submissions = parseWeeklyEditionStorySubmissions(
    JSON.stringify({
      submissions: [
        {
          author: {
            name: "Gord McKenzie",
            position: "Aurora Beat Writer",
            scope: "team",
            teamId: "team-a",
            teamName: "Aurora",
          },
          pitches: [
            {
              pitchId: "aurora-rise",
              leadCandidateId: "power:team-a",
              supportingCandidateIds: ["matchup:matchup-1"],
              proposedHeadline: "Aurora changes the order",
              angle: "The climb changes next week's matchup stakes.",
              scores: {
                consequence: 4,
                readerInterest: 4,
                evidenceStrength: 5,
                freshness: 5,
              },
            },
          ],
        },
      ],
    }),
  );

  assert.equal(submissions[0]?.author.scope, "team");
  assert.equal(submissions[0]?.pitches[0]?.leadCandidateId, "power:team-a");
  assert.equal(submissions[0]?.pitches[0]?.scores.evidenceStrength, 5);
});

void test("extractWeeklyEditionOpenAiText reads the raw Responses API output", () => {
  const text = extractWeeklyEditionOpenAiText({
    output: [
      { type: "reasoning", content: [] },
      {
        type: "message",
        content: [{ type: "output_text", text: '  {"headline":"Final"}  ' }],
      },
    ],
  });

  assert.equal(text, '{"headline":"Final"}');
});

void test("extractWeeklyEditionOpenAiText rejects a response without text", () => {
  assert.throws(
    () => extractWeeklyEditionOpenAiText({ output: [] }),
    /no newsletter content/i,
  );
});

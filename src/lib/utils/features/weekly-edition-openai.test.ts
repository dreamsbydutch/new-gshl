import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyEditionOpenAiRequest,
  buildWeeklyEditionPitchOpenAiRequest,
  extractWeeklyEditionOpenAiText,
  parseWeeklyEditionStorySubmissions,
  parseWeeklyEditionReview,
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

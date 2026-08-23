import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyEditionOpenAiRequest,
  buildWeeklyEditionPitchOpenAiRequest,
  extractWeeklyEditionOpenAiText,
  parseWeeklyEditionStorySubmissions,
} from "./weekly-edition-openai";

void test("buildWeeklyEditionOpenAiRequest disables storage and requires six articles", () => {
  const request = buildWeeklyEditionOpenAiRequest({
    model: "gpt-test",
    prompt: "grounded prompt",
  });

  assert.equal(request.model, "gpt-test");
  assert.equal(request.store, false);
  assert.equal(request.input, "grounded prompt");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.properties.sections.minItems, 6);
  assert.equal(request.text.format.schema.properties.sections.maxItems, 6);
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

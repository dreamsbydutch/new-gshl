import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyEditionOpenAiRequest,
  extractWeeklyEditionOpenAiText,
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

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatchupPreviewConversationRequest,
  parseMatchupPreviewConversation,
} from "./matchup-preview-conversation";
import { matchupPreviewWriterProfile } from "./matchup-preview-articles";

const evidence = {
  writer: "Home Reporter",
  opposingWriter: "Away Reporter",
  homeTeamName: "Home",
  teamName: "Home",
  opponentName: "Away",
  startsAt: 1,
  facts: [{ id: "categories", text: "Home leads goals; Away leads hits." }],
};
const draft = (count = 4) => ({
  headline: "Scoring meets the heavy game",
  turns: Array.from({ length: count }, (_, index) => ({
    speaker: index % 2 === 0 ? "home" : "away",
    text:
      index % 2 === 0
        ? "Your hits will not erase our scoring edge."
        : "Fair, but those hits are still a category you have to win.",
  })),
  evidenceIds: ["categories"],
  prediction: { winner: "team", teamScore: 6, opponentScore: 4 },
});

void test("one conversation contains exactly two responses per writer and one final prediction", () => {
  for (const count of [4]) {
    const parsed = parseMatchupPreviewConversation(
      JSON.stringify(draft(count)),
      evidence,
    );
    assert.equal(parsed.paragraphs.length, count + 1);
    assert.equal(
      parsed.turns.filter((turn) => turn.speaker === "home").length,
      2,
    );
    assert.equal(
      parsed.turns.filter((turn) => turn.speaker === "away").length,
      2,
    );
    assert.match(parsed.paragraphs[0]!, /^Home:/);
    assert.match(parsed.paragraphs[1]!, /^Away:/);
    assert.match(parsed.paragraphs[2]!, /^Home:/);
    assert.match(parsed.paragraphs[3]!, /^Away:/);
    assert.equal(
      parsed.paragraphs.at(-1),
      "Prediction: Home defeats Away, 6–4.",
    );
  }
});

void test("invalid turn counts, away openings, consecutive speakers and embedded paragraphs are rejected", () => {
  for (const count of [2, 3, 5, 6, 7, 8])
    assert.throws(() =>
      parseMatchupPreviewConversation(JSON.stringify(draft(count)), evidence),
    );
  for (const index of [0, 1]) {
    const article = draft();
    article.turns[index]!.speaker = index === 0 ? "away" : "home";
    assert.throws(
      () => parseMatchupPreviewConversation(JSON.stringify(article), evidence),
      /alternate/,
    );
  }
  const article = draft();
  article.turns[0]!.text = "Opening.\nAnother paragraph.";
  assert.throws(
    () => parseMatchupPreviewConversation(JSON.stringify(article), evidence),
    /One paragraph/,
  );
});

void test("every turn uses first names while full identities remain available for the byline", () => {
  const parsed = parseMatchupPreviewConversation(JSON.stringify(draft()), {
    ...evidence,
    writer: "Gord McKenzie",
    opposingWriter: "Ryan O'Rourke",
  });
  assert.match(parsed.paragraphs[0]!, /^Gord:/);
  assert.match(parsed.paragraphs[1]!, /^Ryan:/);
  assert.match(parsed.paragraphs[2]!, /^Gord:/);
  assert.match(parsed.paragraphs[3]!, /^Ryan:/);
});

void test("model-supplied names and dotted initials do not duplicate application labels", () => {
  const article = draft();
  article.turns = [
    { speaker: "home", text: "Gord McKenzie: Here is the opening." },
    { speaker: "away", text: "Ryan O'Rourke: Here is the answer." },
    { speaker: "home", text: "G.M.: And the rebuttal." },
    { speaker: "away", text: "R.O.: We can agree on that." },
    ...article.turns.slice(4),
  ];
  const parsed = parseMatchupPreviewConversation(JSON.stringify(article), {
    ...evidence,
    writer: "Gord McKenzie",
    opposingWriter: "Ryan O'Rourke",
  });
  assert.deepEqual(parsed.paragraphs.slice(0, 4), [
    "Gord: Here is the opening.",
    "Ryan: Here is the answer.",
    "Gord: And the rebuttal.",
    "Ryan: We can agree on that.",
  ]);
  article.turns[0]!.text = "Gord: A shorter label works too.";
  assert.equal(
    parseMatchupPreviewConversation(JSON.stringify(article), {
      ...evidence,
      writer: "Gord McKenzie",
      opposingWriter: "Ryan O'Rourke",
    }).paragraphs[0],
    "Gord: A shorter label works too.",
  );
});

void test("conversation enforces the combined word budget, known facts and category-score rules", () => {
  const tooLong = draft();
  tooLong.turns = tooLong.turns.map((turn) => ({
    ...turn,
    text: Array(100).fill("word").join(" "),
  }));
  assert.throws(
    () => parseMatchupPreviewConversation(JSON.stringify(tooLong), evidence),
    /too long/,
  );
  const withinLimit = draft();
  withinLimit.turns = withinLimit.turns.map((turn) => ({
    ...turn,
    text: Array(75).fill("word").join(" "),
  }));
  assert.doesNotThrow(() =>
    parseMatchupPreviewConversation(JSON.stringify(withinLimit), evidence),
  );
  const longTurn = draft();
  longTurn.turns[0]!.text = Array(101).fill("word").join(" ");
  assert.throws(
    () => parseMatchupPreviewConversation(JSON.stringify(longTurn), evidence),
    /turn is too long/,
  );
  const unknown = draft();
  unknown.evidenceIds = ["invented"];
  assert.throws(
    () => parseMatchupPreviewConversation(JSON.stringify(unknown), evidence),
    /Unknown/,
  );
  for (const prediction of [
    { winner: "opponent", teamScore: 5, opponentScore: 5 },
    { winner: "team", teamScore: 7, opponentScore: 4 },
    { winner: "team", teamScore: 3, opponentScore: 6 },
  ])
    assert.throws(
      () =>
        parseMatchupPreviewConversation(
          JSON.stringify({ ...draft(), prediction }),
          evidence,
        ),
      /Invalid predicted/,
    );
  const tied = parseMatchupPreviewConversation(
    JSON.stringify({
      ...draft(),
      prediction: { winner: "team", teamScore: 5, opponentScore: 5 },
    }),
    evidence,
  );
  assert.match(tied.paragraphs.at(-1)!, /home-ice tiebreaker/);
});

void test("request supplies both stable writer profiles and requires a single concise evidence-grounded debate", () => {
  const request = buildMatchupPreviewConversationRequest("test", evidence);
  const input = JSON.parse(request.input) as {
    homeWriter: { profile: unknown };
    awayWriter: { profile: unknown };
  };
  assert.deepEqual(
    input.homeWriter.profile,
    matchupPreviewWriterProfile(evidence.writer),
  );
  assert.deepEqual(
    input.awayWriter.profile,
    matchupPreviewWriterProfile(evidence.opposingWriter),
  );
  assert.match(request.instructions, /home writer opens/);
  assert.match(request.instructions, /285–325 words/);
  assert.match(request.instructions, /400 words/);
  assert.match(request.instructions, /exactly four conversational turns/);
  assert.match(request.instructions, /65\u201380 words/);
  assert.match(request.instructions, /selective statistics/);
  assert.equal(request.text.format.schema.properties.turns.minItems, 4);
  assert.equal(request.text.format.schema.properties.turns.maxItems, 4);
  assert.match(request.instructions, /Use ONLY supplied facts/);
  assert.equal(request.text.format.schema.properties.evidenceIds.maxItems, 12);
  assert.equal(request.text.format.schema.properties.evidenceIds.minItems, 1);
  assert.deepEqual(
    request.text.format.schema.properties.evidenceIds.items.enum,
    evidence.facts.map((fact) => fact.id),
  );
  assert.throws(() =>
    buildMatchupPreviewConversationRequest("test", {
      ...evidence,
      opposingWriter: undefined,
    }),
  );
  assert.throws(() =>
    buildMatchupPreviewConversationRequest("test", {
      ...evidence,
      homeTeamName: "Away",
    }),
  );
});

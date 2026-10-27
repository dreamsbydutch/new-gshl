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

void test("one conversation contains four or five alternating labelled turns and one final prediction", () => {
  for (const count of [4, 5]) {
    const parsed = parseMatchupPreviewConversation(
      JSON.stringify(draft(count)),
      evidence,
    );
    assert.equal(parsed.paragraphs.length, count + 1);
    assert.match(parsed.paragraphs[0]!, /^Home Reporter:/);
    assert.match(parsed.paragraphs[1]!, /^Away Reporter:/);
    assert.match(parsed.paragraphs[2]!, /^HR:/);
    assert.match(parsed.paragraphs[3]!, /^AR:/);
    if (count === 5) assert.match(parsed.paragraphs[4]!, /^HR:/);
    assert.equal(
      parsed.paragraphs.at(-1),
      "Prediction: Home defeats Away, 6–4.",
    );
  }
});

void test("invalid turn counts, away openings, consecutive speakers and embedded paragraphs are rejected", () => {
  for (const count of [3, 6])
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

void test("returning writers use their initials, including apostrophized surnames", () => {
  const parsed = parseMatchupPreviewConversation(JSON.stringify(draft()), {
    ...evidence,
    writer: "Gord McKenzie",
    opposingWriter: "Ryan O'Rourke",
  });
  assert.match(parsed.paragraphs[0]!, /^Gord McKenzie:/);
  assert.match(parsed.paragraphs[1]!, /^Ryan O'Rourke:/);
  assert.match(parsed.paragraphs[2]!, /^GM:/);
  assert.match(parsed.paragraphs[3]!, /^RO:/);
});

void test("model-supplied names and dotted initials do not duplicate application labels", () => {
  const article = draft();
  article.turns = [
    { speaker: "home", text: "Gord McKenzie: Here is the opening." },
    { speaker: "away", text: "Ryan O'Rourke: Here is the answer." },
    { speaker: "home", text: "G.M.: And the rebuttal." },
    { speaker: "away", text: "R.O.: We can agree on that." },
  ];
  const parsed = parseMatchupPreviewConversation(JSON.stringify(article), {
    ...evidence,
    writer: "Gord McKenzie",
    opposingWriter: "Ryan O'Rourke",
  });
  assert.deepEqual(parsed.paragraphs.slice(0, 4), [
    "Gord McKenzie: Here is the opening.",
    "Ryan O'Rourke: Here is the answer.",
    "GM: And the rebuttal.",
    "RO: We can agree on that.",
  ]);
});

void test("conversation enforces the combined word budget, known facts and category-score rules", () => {
  const tooLong = draft();
  tooLong.turns = tooLong.turns.map((turn) => ({
    ...turn,
    text: Array(101).fill("word").join(" "),
  }));
  assert.throws(
    () => parseMatchupPreviewConversation(JSON.stringify(tooLong), evidence),
    /too long/,
  );
  const withinLimit = draft();
  withinLimit.turns = withinLimit.turns.map((turn) => ({
    ...turn,
    text: Array(90).fill("word").join(" "),
  }));
  assert.doesNotThrow(() =>
    parseMatchupPreviewConversation(JSON.stringify(withinLimit), evidence),
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
  assert.match(request.instructions, /Use ONLY supplied facts/);
  assert.equal(request.text.format.schema.properties.evidenceIds.maxItems, 12);
  assert.equal(request.text.format.schema.properties.evidenceIds.minItems, 1);
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

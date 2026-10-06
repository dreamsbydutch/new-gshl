import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatchupPreviewRequest,
  matchupPreviewWriterProfile,
  easternHour,
  isPreviewDue,
  matchupPreviewStartsAt,
  parseMatchupPreviewArticle,
  PREVIEW_WINDOW_MS,
} from "./matchup-preview-articles";

void test("writer personalities follow the byline across weeks and opponents", () => {
  const packet = {
    writer: "Tyler Beaulieu",
    teamName: "Butabi Brothers",
    opponentName: "Robert Thomas",
    startsAt: 1,
    facts: [],
  };
  const first = JSON.parse(
    buildMatchupPreviewRequest("test", packet).input,
  ) as { writerProfile: unknown };
  const next = JSON.parse(
    buildMatchupPreviewRequest("test", {
      ...packet,
      opponentName: "Peps",
      startsAt: 2,
    }).input,
  ) as { writerProfile: unknown };
  assert.deepEqual(first.writerProfile, next.writerProfile);
  assert.deepEqual(
    first.writerProfile,
    matchupPreviewWriterProfile("  TYLER BEAULIEU  "),
  );
  assert.notDeepEqual(
    first.writerProfile,
    matchupPreviewWriterProfile("Gord McKenzie"),
  );
  const pick = {
    headline: "A close matchup",
    paragraphs: ["First.", "Second."],
    evidenceIds: ["roster"],
    prediction: { winner: "opponent", teamScore: 4, opponentScore: 6 },
  };
  const evidence = {
    ...packet,
    facts: [{ id: "roster", text: "Known roster" }],
  };
  const one = parseMatchupPreviewArticle(JSON.stringify(pick), evidence);
  const two = parseMatchupPreviewArticle(JSON.stringify(pick), {
    ...evidence,
    writer: "Gord McKenzie",
  });
  assert.equal(
    one.paragraphs.at(-1),
    two.paragraphs.at(-1),
    "matching predictions remain valid regardless of personality",
  );
});

void test("preview start uses 3 a.m. Eastern through both DST transitions", () => {
  for (const [date, instant] of [
    ["2026-10-04", "2026-10-04T07:00:00Z"],
    ["2027-01-01", "2027-01-01T08:00:00Z"],
    ["2026-03-08", "2026-03-08T07:00:00Z"],
    ["2026-11-01", "2026-11-01T08:00:00Z"],
  ])
    assert.equal(matchupPreviewStartsAt(date!), Date.parse(instant!));
  for (const date of [null, "invalid", "2026-02-30"])
    assert.equal(matchupPreviewStartsAt(date), null);
  assert.equal(easternHour(Date.parse("2026-10-04T08:00:00Z")), 4);
  assert.equal(easternHour(Date.parse("2027-01-01T09:00:00Z")), 4);
});

void test("article window is strictly less than four days and ends at matchup start", () => {
  const start = Date.parse("2026-10-04T07:00:00Z");
  assert.equal(isPreviewDue(start, start - PREVIEW_WINDOW_MS), false);
  assert.equal(isPreviewDue(start, start - PREVIEW_WINDOW_MS + 1), true);
  assert.equal(isPreviewDue(start, start - 1), true);
  assert.equal(isPreviewDue(start, start), false);
  assert.equal(isPreviewDue(start, start + 1), false);
  assert.equal(isPreviewDue(null, start), false);
});

void test("articles must be concise, structured and reference supplied evidence", () => {
  const evidence = {
    writer: "Beat Writer",
    teamName: "Home",
    opponentName: "Away",
    startsAt: 1,
    facts: [{ id: "roster", text: "Known roster" }],
  };
  const article = {
    headline: "A balanced roster",
    paragraphs: ["First paragraph.", "Second paragraph."],
    evidenceIds: ["roster"],
    prediction: { winner: "team", teamScore: 6, opponentScore: 4 },
  };
  assert.deepEqual(
    parseMatchupPreviewArticle(JSON.stringify(article), evidence),
    {
      ...article,
      paragraphs: [
        ...article.paragraphs,
        "Prediction: Home defeats Away, 6–4.",
      ],
    },
  );
  assert.throws(() =>
    parseMatchupPreviewArticle(
      JSON.stringify({ ...article, evidenceIds: ["invented"] }),
      evidence,
    ),
  );
  assert.throws(() =>
    parseMatchupPreviewArticle(
      JSON.stringify({ ...article, paragraphs: ["Only one"] }),
      evidence,
    ),
  );
  assert.throws(() =>
    parseMatchupPreviewArticle(
      JSON.stringify({
        ...article,
        paragraphs: ["word ".repeat(251), "More."],
      }),
      evidence,
    ),
  );
  assert.throws(() => parseMatchupPreviewArticle("not json", evidence));
  const parsePrediction = (prediction: unknown) =>
    parseMatchupPreviewArticle(JSON.stringify({ ...article, prediction }), {
      ...evidence,
      homeTeamName: "Home",
    });
  assert.equal(
    parsePrediction({
      winner: "opponent",
      teamScore: 3,
      opponentScore: 6,
    }).paragraphs.at(-1),
    "Prediction: Away defeats Home, 6–3.",
  );
  assert.equal(
    parsePrediction({
      winner: "team",
      teamScore: 5,
      opponentScore: 5,
    }).paragraphs.at(-1),
    "Prediction: Home defeats Away, 5–5 (home-ice tiebreaker).",
  );
  for (const prediction of [
    undefined,
    { winner: "other", teamScore: 6, opponentScore: 4 },
    { winner: "team", teamScore: 3, opponentScore: 6 },
    { winner: "team", teamScore: 7, opponentScore: 4 },
    { winner: "team", teamScore: 6.5, opponentScore: 3 },
    { winner: "team", teamScore: 6, opponentScore: -1 },
    { winner: "opponent", teamScore: 5, opponentScore: 5 },
  ])
    assert.throws(() => parsePrediction(prediction));
});

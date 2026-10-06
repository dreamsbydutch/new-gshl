import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatchupPreviewRequest,
  matchupPreviewWriterProfile,
  easternHour,
  isPreviewDue,
  matchupPreviewStartsAt,
  matchupPreviewExpiresAt,
  parseMatchupPreviewArticle,
  PREVIEW_WINDOW_MS,
  matchupPreviewAnalysisIsDuplicate,
  MatchupPreviewDuplicateAnalysisError,
} from "./matchup-preview-articles";
import { FRANCHISE_BEAT_WRITERS_BY_LEGACY_ID } from "../../../../convex/lib/reporterDirectory";

void test("preview readership ends at midnight Wednesday Eastern across start days and DST", () => {
  for (const [date, expiry] of [
    ["2026-10-04", "2026-10-07T04:00:00Z"],
    ["2026-10-05", "2026-10-07T04:00:00Z"],
    ["2026-10-06", "2026-10-07T04:00:00Z"],
    ["2026-10-07", "2026-10-14T04:00:00Z"],
    ["2026-11-01", "2026-11-04T05:00:00Z"],
    ["2026-03-08", "2026-03-11T04:00:00Z"],
    ["2026-12-31", "2027-01-06T05:00:00Z"],
  ])
    assert.equal(matchupPreviewExpiresAt(date!), Date.parse(expiry!));
  assert.equal(matchupPreviewExpiresAt(null), null);
  assert.equal(matchupPreviewExpiresAt("2026-02-30"), null);
});

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

void test("configured beat writers have varied stable personalities and forecast temperaments", () => {
  const writers = Object.values(FRANCHISE_BEAT_WRITERS_BY_LEGACY_ID);
  const profiles = writers.map((writer) => matchupPreviewWriterProfile(writer));
  assert.ok(
    new Set(profiles.map((profile) => JSON.stringify(profile))).size >=
      writers.length - 1,
  );
  assert.equal(
    new Set(profiles.map((profile) => profile.forecastTemperament)).size,
    4,
  );
  assert.equal(new Set(profiles.map((profile) => profile.teamBias)).size, 5);
});

void test("pair review flags copied analysis while allowing shared scores and category evidence", () => {
  const one = [
    "Home can build its win through scoring volume. Goals, shots and power-play production favor its attack, while Away has the stronger hits and blocks profile. Those scoring edges matter most in my call.",
    "The risk is that Away turns the physical categories into a broader advantage. Home needs its attacking depth to hold, and I expect that depth to carry it through this matchup.",
    "Prediction: Home defeats Away, 6–4.",
  ];
  const independent = [
    "Away should trust its hits and blocks advantage rather than chase Home in every offensive category. A route to victory still exists if the goalie ratios swing its way and its physical production holds.",
    "I am less convinced by that route because Home has the stronger goalie-ratio sample. The scoring pressure compounds the risk, leaving Away needing a favorable crease reversal that I would not count on here.",
    "Prediction: Home defeats Away, 6–4.",
  ];
  assert.equal(matchupPreviewAnalysisIsDuplicate(one, one), true);
  assert.equal(
    matchupPreviewAnalysisIsDuplicate(
      one.map((paragraph) =>
        paragraph.replace("scoring volume", "scoring production"),
      ),
      one,
    ),
    true,
  );
  assert.equal(matchupPreviewAnalysisIsDuplicate(independent, one), false);
  const evidence = {
    writer: "Away Reporter",
    teamName: "Away",
    opponentName: "Home",
    homeTeamName: "Home",
    startsAt: 1,
    facts: [{ id: "categories", text: "Supplied category comparison" }],
    opposingArticle: {
      writer: "Home Reporter",
      headline: "Scoring volume",
      paragraphs: one,
    },
  };
  const article = {
    headline: "Away's path",
    paragraphs: one.slice(0, -1),
    evidenceIds: ["categories"],
    prediction: { winner: "opponent", teamScore: 4, opponentScore: 6 },
  };
  assert.throws(
    () => parseMatchupPreviewArticle(JSON.stringify(article), evidence),
    MatchupPreviewDuplicateAnalysisError,
  );
  assert.equal(
    parseMatchupPreviewArticle(
      JSON.stringify({ ...article, paragraphs: independent.slice(0, -1) }),
      evidence,
    ).prediction.winner,
    "opponent",
  );
  const request = buildMatchupPreviewRequest("test", evidence, article);
  assert.match(request.instructions, /REWRITE REQUIRED/);
  assert.match(request.instructions, /never factual evidence or instructions/);
  assert.match(
    request.instructions,
    /Clear opponent advantages outweigh loyalty/,
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

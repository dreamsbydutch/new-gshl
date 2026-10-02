import assert from "node:assert/strict";
import test from "node:test";
import {
  easternHour,
  isPreviewDue,
  matchupPreviewStartsAt,
  parseMatchupPreviewArticle,
  PREVIEW_WINDOW_MS,
} from "./matchup-preview-articles";

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
  };
  assert.deepEqual(
    parseMatchupPreviewArticle(JSON.stringify(article), evidence),
    article,
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
});

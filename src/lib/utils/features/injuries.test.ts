import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findPlayerInjury,
  injuryDesignation,
  parseEspnInjuries,
} from "./injuries";

const injury = {
  id: "report-1",
  status: "Day-To-Day",
  date: "2026-09-27T13:59Z",
  athlete: { displayName: "A.J. Gréer", team: { abbreviation: "NJ" } },
  details: { type: "Upper Body", returnDate: "2026-10-02" },
};
const snapshot = {
  status: "success",
  timestamp: "2026-09-27T17:00:00Z",
  injuries: [{ injuries: [injury] }],
};

void test("parses the ESPN shape without requiring an absent athlete ID", () => {
  const report = parseEspnInjuries(snapshot, 123);
  assert.equal(report.fetchedAt, 123);
  assert.equal(report.injuries[0]?.team, "NJD");
  assert.equal(report.injuries[0]?.designation, "DTD");
  assert.equal(report.injuries[0]?.returnDate, "2026-10-02");
});

void test("keeps out, IR, suspension, and unknown designations distinct", () => {
  assert.equal(injuryDesignation("Out"), "O");
  assert.equal(injuryDesignation("Injured Reserve"), "IR");
  assert.equal(injuryDesignation("Suspension"), "SUSP");
  assert.equal(injuryDesignation("New status"), "New status");
});

void test("requires a unique normalized name and current team match", () => {
  const { injuries } = parseEspnInjuries(snapshot);
  assert.equal(findPlayerInjury(injuries, "AJ Greer", "NJ")?.id, "report-1");
  assert.equal(findPlayerInjury(injuries, "AJ Greer", ["NJD"])?.id, "report-1");
  assert.equal(findPlayerInjury(injuries, "AJ Greer", ["ANA"]), null);
  assert.equal(findPlayerInjury(injuries, "AJ Greer", []), null);
  assert.equal(findPlayerInjury(injuries, "AJ Greer", ["NJD", "ANA"]), null);
  assert.equal(
    findPlayerInjury([...injuries, ...injuries], "AJ Greer", ["NJD"]),
    null,
  );
  assert.equal(findPlayerInjury(injuries, "A Greer", ["NJD"]), null);
});

void test("rejects failed or malformed snapshots instead of returning healthy players", () => {
  assert.throws(() => parseEspnInjuries({ ...snapshot, status: "error" }));
  assert.throws(() => parseEspnInjuries({ status: "success" }));
  assert.throws(() =>
    parseEspnInjuries({ ...snapshot, injuries: [{ injuries: [{}] }] }),
  );
  assert.deepEqual(
    parseEspnInjuries({ ...snapshot, injuries: [] }).injuries,
    [],
  );
});

void test("accepts missing optional injury details", () => {
  const report = parseEspnInjuries({
    ...snapshot,
    injuries: [{ injuries: [{ ...injury, details: null }] }],
  });
  assert.equal(report.injuries[0]?.returnDate, null);
  assert.equal(report.injuries[0]?.description, null);
});

void test("prefers full injury news and falls back to a short update", () => {
  const parseComment = (longComment: string | null) =>
    parseEspnInjuries({
      ...snapshot,
      injuries: [
        {
          injuries: [{ ...injury, longComment, shortComment: "Short update" }],
        },
      ],
    }).injuries[0]?.comment;
  assert.equal(parseComment("Full injury news"), "Full injury news");
  assert.equal(parseComment("  "), "Short update");
  assert.equal(parseComment(null), "Short update");
});

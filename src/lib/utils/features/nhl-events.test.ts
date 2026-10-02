import assert from "node:assert/strict";
import test from "node:test";
import { buildNHLGameEvents, nhlEventFeedSchema } from "./nhl-events";

const goal = {
  eventId: 2,
  typeDescKey: "goal",
  timeInPeriod: "10:03",
  periodDescriptor: { number: 1, periodType: "REG" },
  details: {
    eventOwnerTeamId: 16,
    scoringPlayerId: 1,
    assist1PlayerId: 2,
    goalieInNetId: 3,
    awayScore: 1,
    homeScore: 0,
  },
};
const penalty = {
  eventId: 1,
  typeDescKey: "penalty",
  timeInPeriod: "06:58",
  periodDescriptor: { number: 1, periodType: "REG" },
  details: {
    eventOwnerTeamId: 13,
    committedByPlayerId: 3,
    drawnByPlayerId: 1,
    servedByPlayerId: 4,
    descKey: "high-sticking",
    duration: 2,
  },
};
const raw = {
  id: 2025020001,
  awayTeam: { id: 16, abbrev: "CHI" },
  homeTeam: { id: 13, abbrev: "FLA" },
  rosterSpots: [1, 2, 3, 4].map((playerId) => ({
    playerId,
    firstName: { default: "Same" },
    lastName: { default: "Name" },
  })),
  plays: [goal, penalty, { ...goal, eventId: 3, typeDescKey: "faceoff" }],
};

void test("goals and penalties sort chronologically and highlight all GSHL participants by ID", () => {
  const feed = nhlEventFeedSchema.parse(raw);
  const events = buildNHLGameEvents(feed, [
    { fullName: "Same Name", nhlPlayerId: 1, stats: null },
    { fullName: "Same Name", stats: { playerId: 3, position: "G" } },
  ]);
  assert.deepEqual(
    events.map((event) => event.id),
    [1, 2],
  );
  assert.deepEqual(
    feed.plays.map((play) => play.eventId),
    [2, 1],
  );
  assert.equal(events[0]?.description, "high sticking · 2 min");
  assert.deepEqual(
    events[0]?.participants.map((player) => [player.role, player.isGshl]),
    [
      ["By", true],
      ["Drawn by", true],
      ["Served by", false],
    ],
  );
  assert.equal(events[1]?.score, "CHI 1 – 0 FLA");
  assert.equal(events[1]?.team, "CHI");
  assert.deepEqual(
    events[1]?.participants.map((player) => [player.role, player.isGshl]),
    [
      ["Scorer", true],
      ["Assist", false],
      ["Against", true],
    ],
  );
});

void test("events handle overtime, missing names, bench penalties and unavailable feeds", () => {
  const feed = nhlEventFeedSchema.parse({
    ...raw,
    rosterSpots: [],
    plays: [
      {
        ...goal,
        periodDescriptor: { number: 5, periodType: "OT" },
        details: { scoringPlayerId: 99 },
      },
      {
        ...penalty,
        details: { descKey: "too-many-men-on-the-ice", duration: 2 },
      },
    ],
  });
  const events = buildNHLGameEvents(feed, []);
  assert.equal(events[0]?.participants.length, 0);
  assert.equal(events[1]?.period, "2OT");
  assert.equal(events[1]?.participants[0]?.name, "Player #99");
  assert.equal(events[1]?.description, "Unassisted");
  assert.equal(events[1]?.score, null);
  assert.deepEqual(buildNHLGameEvents(null, []), []);
  assert.deepEqual(
    buildNHLGameEvents(nhlEventFeedSchema.parse({ ...raw, plays: [] }), []),
    [],
  );
});

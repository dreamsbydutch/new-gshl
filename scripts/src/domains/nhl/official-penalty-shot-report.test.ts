import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOfficialPenaltyShots,
  penaltyShotGameMatches,
} from "./official-penalty-shot-report";
import { extractShotTrainingRows } from "./game-value-input";

const game = {
  id: 2013020678,
  gameDate: "2014-01-11",
  homeTeam: { id: 18 },
  awayTeam: { id: 9 },
  rosterSpots: [
    { playerId: 8473537, sweaterNumber: 25, lastName: { default: "Stalberg" } },
  ],
  plays: [
    {
      eventId: 45,
      sortOrder: 137,
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: "11:47",
      typeDescKey: "shot-on-goal",
      situationCode: "1551",
      homeTeamDefendingSide: "left",
      details: {
        shootingPlayerId: 8473537,
        goalieInNetId: 8467950,
        eventOwnerTeamId: 18,
        xCoord: 74,
        yCoord: 5,
        zoneCode: "O",
      },
    },
  ],
};
const totals = [
  {
    gameId: game.id,
    playerId: 8473537,
    penaltyShotAttempts: 1,
    penaltyShotsGoals: 0,
  },
];
const html = `<html><title>Play By Play</title><table><tr><td>Game 0678</td><td>Saturday, January 11, 2014</td></tr>
<tr><td>70</td><td>1</td><td>EV</td><td>11:47<br>8:13</td><td>SHOT</td><td>NSH ONGOAL - #25 STALBERG, Penalty Shot, Wrist, Off. Zone, 16 ft.</td></tr></table></html>`;
test("an explicit official report label recovers lost NHL penalty-shot classification without double counting", () => {
  assert.equal(penaltyShotGameMatches(game, totals), false);
  const ids = parseOfficialPenaltyShots(html, game, totals);
  assert.deepEqual(ids, [45]);
  const annotated = {
    ...game,
    plays: game.plays.map((p) => ({
      ...p,
      details: { ...p.details, nhlReportPenaltyShot: true },
    })),
  };
  assert.equal(penaltyShotGameMatches(annotated, totals), true);
  assert.equal(extractShotTrainingRows(game).length, 1);
  assert.equal(extractShotTrainingRows(annotated).length, 0);
});
test("wrong report scopes, ambiguous event matches and conflicting official totals cannot annotate shots", () => {
  assert.throws(
    () =>
      parseOfficialPenaltyShots(
        html.replace("Game 0678", "Game 0679"),
        game,
        totals,
      ),
    /scope/,
  );
  assert.throws(
    () =>
      parseOfficialPenaltyShots(
        html.replace("January 11", "January 12"),
        game,
        totals,
      ),
    /scope/,
  );
  assert.throws(
    () =>
      parseOfficialPenaltyShots(
        html,
        { ...game, plays: [...game.plays, { ...game.plays[0]!, eventId: 46 }] },
        totals,
      ),
    /Ambiguous/,
  );
  assert.throws(
    () =>
      parseOfficialPenaltyShots(html, game, [
        { ...totals[0]!, penaltyShotsGoals: 1 },
      ]),
    /totals differ/,
  );
});

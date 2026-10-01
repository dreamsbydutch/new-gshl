import assert from "node:assert/strict";
import test from "node:test";
import { parseOfficialShiftReport } from "./official-shift-report";

const game = {
  id: 2024021250,
  gameDate: "2025-04-10",
  homeTeam: { id: 6 },
  awayTeam: { id: 16 },
  rosterSpots: [
    {
      teamId: 6,
      playerId: 1,
      sweaterNumber: 88,
      lastName: { default: "Pastrnak" },
    },
  ],
};
const html = `<html><head><title>Time On Ice Report Home Team</title></head><body>
<table><tr><td>Game 1250</td><td>Thursday, April 10, 2025</td></tr></table>
<table><tr><td class="playerHeading">88 PASTRNAK, DAVID</td></tr>
<tr><td>1</td><td>1</td><td>0:00 / 20:00</td><td>0:45 / 19:15</td><td>00:45</td><td></td></tr>
<tr><td>2</td><td>OT</td><td>1:00 / 4:00</td><td>1:30 / 3:30</td><td>00:30</td><td></td></tr>
<tr><td>1</td><td>2</td><td>00:37</td><td>01:15</td><td>01:15</td><td>00:00</td></tr>
</table></body></html>`;
test("official TOI reports recover exact shifts through team/jersey identity and validate the source scope", () => {
  const shifts = parseOfficialShiftReport(html, game, true);
  assert.equal(shifts.length, 2);
  assert.equal(shifts[0]!.playerId, 1);
  assert.equal(shifts[1]!.period, 4);
  assert.equal(
    parseOfficialShiftReport(
      html.replace("Game 1250", "Game 01250"),
      game,
      true,
    ).length,
    2,
  );
  assert.throws(() => parseOfficialShiftReport(html, game, false), /side/);
  assert.throws(
    () =>
      parseOfficialShiftReport(
        html.replace("Game 1250", "Game 1251"),
        game,
        true,
      ),
    /game/,
  );
  assert.throws(
    () =>
      parseOfficialShiftReport(
        html.replace("April 10", "April 11"),
        game,
        true,
      ),
    /date/,
  );
  assert.throws(
    () =>
      parseOfficialShiftReport(html.replace("PASTRNAK", "OTHER"), game, true),
    /jersey/,
  );
  assert.throws(
    () =>
      parseOfficialShiftReport(
        html.replace("00:45</td>", "00:55</td>"),
        game,
        true,
      ),
    /interval/,
  );
});

test("successive players in one report table do not inherit each other's shifts", () => {
  const additional =
    '<tr><td class="playerHeading">1 SWAYMAN, JEREMY</td></tr><tr><td>1</td><td>1</td><td>0:00 / 20:00</td><td>20:00 / 0:00</td><td>20:00</td><td></td></tr>';
  const report = html.replace(
    "</table></body>",
    additional + "</table></body>",
  );
  const roster = {
    ...game,
    rosterSpots: [
      ...game.rosterSpots,
      {
        teamId: 6,
        playerId: 2,
        sweaterNumber: 1,
        lastName: { default: "Swayman" },
      },
    ],
  };
  const rows = parseOfficialShiftReport(report, roster, true);
  assert.deepEqual(
    rows.map((r) => r.playerId),
    [1, 1, 2],
  );
});

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

test("period-horn clock resets require agreeing duration and remaining clocks", () => {
  const report = html.replace(
    "1:00 / 4:00</td><td>1:30 / 3:30</td><td>00:30",
    "4:45 / 0:15</td><td>0:00 / 0:00</td><td>00:15",
  );
  const rows = parseOfficialShiftReport(report, game, true);
  assert.equal(rows[1]!.endTime, "5:00");
  for (const invalid of [
    report.replace("4:45 / 0:15", "4:45 / 0:16"),
    report.replace("0:00 / 0:00", "0:00 / 0:01"),
    report.replace("00:15</td>", "00:14</td>"),
  ])
    assert.throws(
      () => parseOfficialShiftReport(invalid, game, true),
      /interval/,
    );
  const regulation = report
    .replace("<td>OT</td>", "<td>3</td>")
    .replace("4:45 / 0:15", "19:45 / 0:15");
  assert.equal(
    parseOfficialShiftReport(regulation, game, true)[1]!.endTime,
    "20:00",
  );
});

test("a goalie full-period summary recovers an omitted interval without locating partial shifts", () => {
  const summary = `<tr><td>Per</td><td>SHF</td><td>AVG</td><td>TOI</td><td>EV TOT</td><td>PP TOT</td><td>SH TOT</td></tr>
  <tr><td>3</td><td>0</td><td></td><td>20:00</td><td>18:00</td><td>00:00</td><td>02:00</td></tr>`;
  const report = html.replace("</table></body>", summary + "</table></body>");
  const goalieGame = {
    ...game,
    rosterSpots: game.rosterSpots.map((p) => ({ ...p, positionCode: "G" })),
  };
  const rows = parseOfficialShiftReport(report, goalieGame, true);
  assert.equal(rows.length, 3);
  const corrupt = report.replace("00:45</td>", "55:00</td>");
  assert.throws(
    () => parseOfficialShiftReport(corrupt, goalieGame, true),
    /interval/,
  );
  const isolated = parseOfficialShiftReport(
    corrupt,
    goalieGame,
    true,
    [],
    true,
  );
  assert.equal(isolated.length, 1);
  assert.equal(isolated[0]!.period, 3);
  assert.deepEqual(
    [rows[2]!.period, rows[2]!.startTime, rows[2]!.endTime],
    [3, "0:00", "20:00"],
  );
  assert.equal(parseOfficialShiftReport(report, game, true).length, 2);
  for (const changed of [
    summary.replace("20:00", "19:00"),
    summary.replace("18:00", "17:00"),
    summary.replace("<td>0</td>", "<td>?</td>"),
    summary.replace("<td>3</td>", "<td>1</td>"),
  ])
    assert.equal(
      parseOfficialShiftReport(
        html.replace("</table></body>", changed + "</table></body>"),
        goalieGame,
        true,
      ).length,
      2,
    );
});

test("an API open shift is closed only by an exact, nonoverlapping period-total reconciliation", () => {
  const summary = `<tr><td>Per</td><td>SHF</td><td>AVG</td><td>TOI</td><td>EV\n TOT</td><td>PP TOT</td><td>SH TOT</td></tr>
  <tr><td>1</td><td>1</td><td>00:45</td><td>01:45</td><td>01:45</td><td>00:00</td><td>00:00</td></tr>`;
  const report = html.replace("</table></body>", summary + "</table></body>");
  const open = {
    gameId: game.id,
    teamId: 6,
    playerId: 1,
    period: 1,
    typeCode: 517,
    startTime: "19:00",
    endTime: "",
    duration: "00:00",
  };
  const rows = parseOfficialShiftReport(report, game, true, [open]);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    [rows[2]!.period, rows[2]!.startTime, rows[2]!.endTime],
    [1, "19:00", "20:00"],
  );
  for (const inputs of [
    [],
    [open, open],
    [{ ...open, teamId: 16 }],
    [{ ...open, startTime: "18:59" }],
    [{ ...open, startTime: "00:30" }],
  ])
    assert.equal(
      parseOfficialShiftReport(report, game, true, inputs).length,
      2,
    );
  assert.equal(
    parseOfficialShiftReport(report.replaceAll("01:45", "01:44"), game, true, [
      open,
    ]).length,
    2,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseOfficialOvertimeEnd } from "./official-game-clock";
import {
  buildGameValueData,
  extractShotTrainingRows,
} from "./game-value-input";
import { gameFixture } from "./game-value-fixtures";

function fixture() {
  const game = {
    id: 2009020002,
    gameDate: "2009-10-01",
    gameType: 2,
    gameState: "OFF",
    gameOutcome: { lastPeriodType: "OT", otPeriods: 1 },
    homeTeam: { id: 10, abbrev: "TOR", score: 3 },
    awayTeam: { id: 8, abbrev: "MTL", score: 4 },
    plays: [
      {
        periodDescriptor: { number: 4, periodType: "OT" },
        timeInPeriod: "04:24",
      },
    ],
  };
  const teams = ["MTL", "TOR", "TOR", "MTL", "MTL", "TOR", "MTL"];
  const rows = teams
    .map(
      (team, i) =>
        `<tr>${[String(i + 1), i === 6 ? "OT" : "3", i === 6 ? "4:47" : "1:00", "EV", team, "26 J.GORGES(1)", "", "", "1, 2, 3", "4, 5, 6"].map((s) => `<td>${s}</td>`).join("")}</tr>`,
    )
    .join("");
  const html = `<title>Game Summary</title><table><tr><td>Game 0002</td><td>Thursday, October 1, 2009</td><td>Final</td></tr>${rows}</table>`;
  return { game, html };
}

test("final official scoring summary locates an omitted OT tail without creating a scoring event", () => {
  const { game, html } = fixture(),
    before = JSON.stringify(game);
  assert.deepEqual(parseOfficialOvertimeEnd(html, game), {
    period: 4,
    seconds: 287,
  });
  assert.equal(JSON.stringify(game), before);
  const f = gameFixture();
  const last = f.sources.pbp.plays[0]!;
  const sources = {
    ...f.sources,
    shifts: [],
    pbp: {
      ...f.sources.pbp,
      plays: [
        ...f.sources.pbp.plays,
        ...[2, 3, 4].map((period) => ({
          ...last,
          eventId: 100 + period,
          sortOrder: 100 + period,
          typeDescKey: "stoppage",
          timeInPeriod: period === 4 ? "04:24" : "20:00",
          periodDescriptor: {
            number: period,
            periodType: period === 4 ? "OT" : "REG",
          },
        })),
      ],
    },
  };
  const presence = new Map(
    extractShotTrainingRows(sources.pbp).map((s) => [s.eventId, 0]),
  );
  const original = buildGameValueData(sources, [], presence);
  const corrected = buildGameValueData(
    { ...sources, officialPeriodEnds: [{ period: 4, seconds: 287 }] },
    [],
    presence,
  );
  assert.equal(original.gameSeconds, 3864);
  assert.equal(corrected.gameSeconds, 3887);
  assert.equal(corrected.usableProcessSeconds, 0);
  assert.deepEqual(corrected.shots, original.shots);
  assert.equal(
    corrected.homeGoals + corrected.awayGoals,
    original.homeGoals + original.awayGoals,
  );
  assert.equal(corrected.officialShots, original.officialShots);
  assert.throws(
    () =>
      buildGameValueData(
        { ...sources, officialPeriodEnds: [{ period: 4, seconds: 263 }] },
        [],
      ),
    /period end/,
  );
  assert.throws(
    () =>
      buildGameValueData(
        {
          ...sources,
          officialPeriodEnds: [
            { period: 4, seconds: 287 },
            { period: 4, seconds: 287 },
          ],
        },
        [],
      ),
    /period end/,
  );
});

test("wrong summary identity, inconsistent scoring, unresolved result and shorter official clocks fail closed", () => {
  const { game, html } = fixture();
  for (const bad of [
    html.replace("Game 0002", "Game 0003"),
    html.replace("October 1", "October 2"),
    html.replace("Final", "Preview"),
    html.replace("Game Summary", "Play By Play"),
    html.replace("4:47", "0:01"),
    html.replace("4:47", "5:01"),
    html.replace("<td>OT</td>", "<td>3</td>"),
    html.replace("<td>7</td>", "<td>8</td>"),
  ])
    assert.throws(() => parseOfficialOvertimeEnd(bad, game));
  assert.throws(() => parseOfficialOvertimeEnd(html, { ...game, gameType: 3 }));
  assert.throws(() =>
    parseOfficialOvertimeEnd(html, {
      ...game,
      gameOutcome: { lastPeriodType: "SO", otPeriods: 1 },
    }),
  );
  assert.throws(() =>
    parseOfficialOvertimeEnd(html, {
      ...game,
      homeTeam: { ...game.homeTeam, score: 4 },
    }),
  );
  assert.throws(() =>
    parseOfficialOvertimeEnd(html, {
      ...game,
      plays: [{ ...game.plays[0]!, timeInPeriod: "04:48" }],
    }),
  );
});

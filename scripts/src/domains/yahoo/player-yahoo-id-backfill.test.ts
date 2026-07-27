import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeYahooPlayerPositionRows,
  parseHistoricalYahooPlayersPage,
} from "./player-yahoo-id-backfill";

const yahooRow = `
  <table>
    <tbody>
      <tr>
        <td>watch</td>
        <td class="player">
          <div class="ysf-player-name">
            <a href="https://sports.yahoo.com/nhl/players/6743">
              Connor McDavid
            </a>
          </div>
          <div class="ysf-player-detail"></div>
        </td>
      </tr>
    </tbody>
  </table>
`;

test("uses the Yahoo position filter when the player detail text is empty", () => {
  const players = parseHistoricalYahooPlayersPage(
    yahooRow,
    "skater",
    "https://example.test/players?pos=C",
    0,
    "C",
  );

  assert.equal(players.length, 1);
  assert.equal(players[0]?.yahooId, "6743");
  assert.deepEqual(players[0]?.positions, ["C"]);
});

test("unions every Yahoo eligibility filter containing the same player", () => {
  const centerRows = parseHistoricalYahooPlayersPage(
    yahooRow,
    "skater",
    "https://example.test/players?pos=C",
    0,
    "C",
  );
  const rightWingRows = parseHistoricalYahooPlayersPage(
    yahooRow,
    "skater",
    "https://example.test/players?pos=RW",
    0,
    "RW",
  );

  const players = mergeYahooPlayerPositionRows([
    ...centerRows,
    ...rightWingRows,
  ]);

  assert.equal(players.length, 1);
  assert.deepEqual(players[0]?.positions, ["C", "RW"]);
  assert.equal(players[0]?.posGroup, "F");
});

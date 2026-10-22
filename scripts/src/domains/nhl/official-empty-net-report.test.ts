import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HockeyDataCache,
  fetchGamePlayByPlay,
} from "../../integrations/nhl/game-value-source";
import {
  applyOfficialEmptyNetSupplement,
  parseOfficialEmptyNetCorrections,
} from "./official-empty-net-report";
import { extractShotTrainingRows } from "./game-value-input";

const hashes = {
  pbpSha256: "a".repeat(64),
  htmlSha256: "b".repeat(64),
  boxSha256: "c".repeat(64),
};
function fixture() {
  const rosterSpots = [
    ...Array.from({ length: 6 }, (_, i) => ({
      playerId: i + 1,
      teamId: 15,
      sweaterNumber: i + 1,
      positionCode: i === 5 ? "G" : "F",
      lastName: { default: `AWAY${i + 1}` },
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      playerId: i + 11,
      teamId: 2,
      sweaterNumber: i + 11,
      positionCode: "F",
      lastName: { default: `HOME${i + 11}` },
    })),
    {
      playerId: 201,
      teamId: 2,
      sweaterNumber: 40,
      positionCode: "G",
      lastName: { default: "GOALIE" },
    },
  ];
  const event = (eventId: number, clock: string) => ({
    eventId,
    sortOrder: eventId,
    periodDescriptor: { number: 3, periodType: "REG" },
    timeInPeriod: clock,
    situationCode: "1551",
    homeTeamDefendingSide: "left",
    typeDescKey: "goal",
    details: {
      scoringPlayerId: 1,
      eventOwnerTeamId: 15,
      xCoord: -19,
      yCoord: -15,
      zoneCode: "N",
      shotType: "wrist",
    },
  });
  const pbp = {
    id: 2019020743,
    gameDate: "2020-01-18",
    awayTeam: { id: 15, abbrev: "WSH", score: 2 },
    homeTeam: { id: 2, abbrev: "NYI", score: 0 },
    rosterSpots,
    plays: [
      {
        ...event(1, "18:00"),
        details: { ...event(1, "18:00").details, goalieInNetId: 201 },
      },
      event(2, "19:04"),
    ],
  };
  const box = {
    id: pbp.id,
    gameDate: pbp.gameDate,
    awayTeam: pbp.awayTeam,
    homeTeam: pbp.homeTeam,
    playerByGameStats: {
      homeTeam: { goalies: [{ playerId: 201, goalsAgainst: 1 }] },
      awayTeam: { goalies: [{ playerId: 6, goalsAgainst: 0 }] },
    },
  };
  const fonts = (ids: number[]) =>
    ids
      .map((id) => {
        const p = rosterSpots.find((p) => p.playerId === id)!;
        return `<font title="${p.positionCode === "G" ? "Goalie" : "Center"} - ${p.lastName.default}">${p.sweaterNumber}</font>`;
      })
      .join("");
  const row = `<tr><td>298</td><td>3</td><td>EV</td><td>19:04<br>0:56</td><td>GOAL</td><td>WSH #1 AWAY1(2), Wrist</td><td>${fonts([1, 2, 3, 4, 5, 6])}</td><td>${fonts([11, 12, 13, 14, 15, 16])}</td></tr>`;
  const html = `<html><head><title>Play By Play</title></head><body><table><tr><td>Game 0743</td><td>Saturday, January 18, 2020</td></tr>${row}</table></body></html>`;
  return { pbp, box, html, row };
}
test("a uniquely rostered official empty-net lineup fixes both source features and attribution metadata without mutating raw events", () => {
  const f = fixture(),
    before = structuredClone(f.pbp);
  const supplement = parseOfficialEmptyNetCorrections(
    f.html,
    f.pbp,
    f.box,
    [2],
    hashes,
  );
  assert.equal(supplement.corrections[0]!.correctedSituation, "1560");
  const corrected = applyOfficialEmptyNetSupplement(
    f.pbp,
    hashes.pbpSha256,
    supplement,
  );
  assert.deepEqual(f.pbp, before);
  assert.equal(corrected.plays[0], f.pbp.plays[0]);
  assert.equal(
    extractShotTrainingRows(f.pbp).find((r) => r.eventId === 2)!.features[7],
    0,
  );
  assert.equal(
    extractShotTrainingRows(corrected).find((r) => r.eventId === 2)!
      .features[7],
    1,
  );
  assert.equal(corrected.plays[1]!.situationCode, "1560");
});
test("missing event goalie alone, wrong scope, ambiguous report or contradictory box accounting never authorize a correction", () => {
  const f = fixture();
  assert.throws(() =>
    parseOfficialEmptyNetCorrections(
      f.html.replace("Game 0743", "Game 0744"),
      f.pbp,
      f.box,
      [2],
      hashes,
    ),
  );
  assert.throws(() =>
    parseOfficialEmptyNetCorrections(
      f.html.replace(f.row, f.row + f.row),
      f.pbp,
      f.box,
      [2],
      hashes,
    ),
  );
  assert.throws(() =>
    parseOfficialEmptyNetCorrections(
      f.html.replace("Center - HOME16", "Goalie - HOME16"),
      f.pbp,
      f.box,
      [2],
      hashes,
    ),
  );
  assert.throws(() =>
    parseOfficialEmptyNetCorrections(
      f.html.replace("WSH #1 AWAY1", "WSH #2 AWAY2"),
      f.pbp,
      f.box,
      [2],
      hashes,
    ),
  );
  const box = structuredClone(f.box);
  box.playerByGameStats.homeTeam.goalies[0]!.goalsAgainst = 2;
  assert.throws(() =>
    parseOfficialEmptyNetCorrections(f.html, f.pbp, box, [2], hashes),
  );
});
test("raw hashes, event identity, every roster identity and empty-net direction are bound before overlay", () => {
  const f = fixture(),
    s = parseOfficialEmptyNetCorrections(f.html, f.pbp, f.box, [2], hashes);
  assert.throws(() =>
    applyOfficialEmptyNetSupplement(f.pbp, "d".repeat(64), s),
  );
  const changed = structuredClone(f.pbp);
  changed.plays[1]!.timeInPeriod = "19:05";
  assert.throws(() =>
    applyOfficialEmptyNetSupplement(changed, hashes.pbpSha256, s),
  );
  const wrong = structuredClone(s);
  wrong.corrections[0]!.homePlayers[0] = 1;
  assert.throws(() =>
    applyOfficialEmptyNetSupplement(f.pbp, hashes.pbpSha256, wrong),
  );
  const goalie = structuredClone(s);
  goalie.corrections[0]!.homePlayers[0] = 201;
  assert.throws(() =>
    applyOfficialEmptyNetSupplement(f.pbp, hashes.pbpSha256, goalie),
  );
});

test("offline source loading rechecks the report and box bodies before a supplement reaches shot extraction", async () => {
  const f = fixture(),
    directory = await mkdtemp(join(tmpdir(), "nhl-empty-net-"));
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const pbpUrl =
    "https://api-web.nhle.com/v1/gamecenter/2019020743/play-by-play";
  const htmlUrl =
    "https://www.nhl.com/scores/htmlreports/20192020/PL020743.HTM";
  const boxUrl = "https://api-web.nhle.com/v1/gamecenter/2019020743/boxscore";
  const buffers = [
    Buffer.from(JSON.stringify(f.pbp)),
    Buffer.from(f.html),
    Buffer.from(JSON.stringify(f.box)),
  ];
  try {
    for (const [i, url] of [pbpUrl, htmlUrl, boxUrl].entries()) {
      const key = sha(Buffer.from(url)),
        body = buffers[i]!;
      await writeFile(join(directory, key + ".bin"), body, { flag: "wx" });
      await writeFile(
        join(directory, key + ".json"),
        JSON.stringify({ url, sha256: sha(body) }),
        { flag: "wx" },
      );
    }
    const cache = new HockeyDataCache(directory, true);
    const correction = parseOfficialEmptyNetCorrections(
      f.html,
      f.pbp,
      f.box,
      [2],
      {
        pbpSha256: sha(buffers[0]!),
        htmlSha256: sha(buffers[1]!),
        boxSha256: sha(buffers[2]!),
      },
    );
    await cache.saveDerived("official-empty-net-2019020743", correction, [
      pbpUrl,
      htmlUrl,
      boxUrl,
    ]);
    const loaded = await fetchGamePlayByPlay(cache, 2019020743);
    assert.equal(
      extractShotTrainingRows(loaded).find((r) => r.eventId === 2)!.features[7],
      1,
    );
    const original = JSON.parse(
      (await cache.bytes(pbpUrl)).toString(),
    ) as typeof f.pbp;
    assert.equal(original.plays[1]!.situationCode, "1551");
    // A source cache metadata entry alone cannot authenticate altered body bytes.
    await writeFile(
      join(directory, sha(Buffer.from(htmlUrl)) + ".bin"),
      f.html.replace("Game 0743", "Game 0744"),
    );
    await assert.rejects(
      fetchGamePlayByPlay(cache, 2019020743),
      /hash mismatch/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("short-handed primary lineups preserve the native shooting side and require complete goalie SA/GA", () => {
  const f = fixture(),
    before = structuredClone(f.pbp);
  f.pbp.plays[1]!.situationCode = "1451";
  const html = f.html
    .replace('<font title="Center - AWAY5">5</font>', "")
    .replace(
      /(<font title="(Goalie|Center)[^"]*">\d+<\/font>)/g,
      (_, font: string, position: string) =>
        `${font} ${position === "Goalie" ? "G" : "C"} `,
    );
  const box = {
    ...f.box,
    playerByGameStats: {
      homeTeam: {
        goalies: f.box.playerByGameStats.homeTeam.goalies.map((g) => ({
          ...g,
          shotsAgainst: 1,
        })),
      },
      awayTeam: {
        goalies: f.box.playerByGameStats.awayTeam.goalies.map((g) => ({
          ...g,
          shotsAgainst: 0,
        })),
      },
    },
  };
  const rawBefore = structuredClone(f.pbp),
    proof = parseOfficialEmptyNetCorrections(html, f.pbp, box, [2], hashes),
    fixed = applyOfficialEmptyNetSupplement(f.pbp, hashes.pbpSha256, proof);
  assert.equal(proof.corrections[0]!.awayPlayers.length, 5);
  assert.equal(proof.corrections[0]!.correctedSituation, "1460");
  assert.deepEqual(f.pbp, rawBefore);
  assert.deepEqual(fixed.plays[0], before.plays[0]);
  assert.deepEqual(fixed.plays[1]!.details, f.pbp.plays[1]!.details);
  assert.equal(fixed.plays[1]!.situationCode, "1460");
  // Printed players cannot disappear merely because their title attribute did.
  assert.throws(
    () =>
      parseOfficialEmptyNetCorrections(
        html.replace('title="Center - AWAY4"', ""),
        f.pbp,
        box,
        [2],
        hashes,
      ),
    /Incomplete/,
  );
  for (const originalSituation of ["1551", "1441", "1251"]) {
    const raw = structuredClone(f.pbp);
    raw.plays[1]!.situationCode = originalSituation;
    assert.throws(() =>
      parseOfficialEmptyNetCorrections(html, raw, box, [2], hashes),
    );
  }
  const wrongSA = structuredClone(box);
  wrongSA.playerByGameStats.homeTeam.goalies[0]!.shotsAgainst = 2;
  assert.throws(
    () => parseOfficialEmptyNetCorrections(html, f.pbp, wrongSA, [2], hashes),
    /complete goalie SA/,
  );
  const wrongGA = structuredClone(box);
  wrongGA.playerByGameStats.homeTeam.goalies[0]!.goalsAgainst = 2;
  assert.throws(
    () => parseOfficialEmptyNetCorrections(html, f.pbp, wrongGA, [2], hashes),
    /goal\/box/,
  );
  for (const badHtml of [
    html.replace('<font title="Goalie - AWAY6">6</font>', ""),
    html
      .replace('<font title="Center - AWAY4">4</font>', "")
      .replace('<font title="Center - AWAY3">3</font>', ""),
    html.replace("Center - HOME16", "Goalie - HOME16"),
  ])
    assert.throws(() =>
      parseOfficialEmptyNetCorrections(badHtml, f.pbp, box, [2], hashes),
    );
  const unknown = structuredClone(f.pbp);
  unknown.plays.push({
    ...unknown.plays[0]!,
    eventId: 3,
    typeDescKey: "shot-on-goal",
    details: { ...unknown.plays[1]!.details },
  });
  assert.throws(
    () => parseOfficialEmptyNetCorrections(html, unknown, box, [2], hashes),
    /physical goalie/,
  );
  const duplicate = structuredClone(f.pbp);
  duplicate.rosterSpots.push({ ...duplicate.rosterSpots[0]! });
  assert.throws(() =>
    parseOfficialEmptyNetCorrections(html, duplicate, box, [2], hashes),
  );
});

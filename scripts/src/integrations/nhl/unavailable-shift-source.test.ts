import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HockeyDataCache } from "./game-value-source";
import {
  loadReviewedUnavailableShifts,
  unavailableShiftParserBinding,
  unavailableShiftProofKey,
  applyCachedUnavailableShiftProof,
  collectReviewedUnavailableShiftProof,
} from "./unavailable-shift-source";
import type { UnavailableShiftProof } from "../../domains/nhl/unavailable-shift-proof";
import { gameFixture } from "../../domains/nhl/game-value-fixtures";
import {
  buildGameValueData,
  extractShotTrainingRows,
} from "../../domains/nhl/game-value-input";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "unavailable-shifts-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cache = new HockeyDataCache(directory, true),
    f = gameFixture(),
    id = 2009020002;
  const pbp = {
      ...f.sources.pbp,
      id,
      gameDate: "2009-10-01",
      rosterSpots: [
        {
          playerId: 1,
          teamId: 1,
          sweaterNumber: 88,
          lastName: { default: "Pastrnak" },
        },
        {
          playerId: 11,
          teamId: 2,
          sweaterNumber: 88,
          lastName: { default: "Pastrnak" },
        },
      ],
    },
    box = { ...f.sources.box, id, gameDate: pbp.gameDate };
  const proof: UnavailableShiftProof = {
    version: "nhl-reviewed-unavailable-shifts-v1",
    gameId: id,
    parserBindingSha256: (await unavailableShiftParserBinding()).sha256,
    derivedShiftsSha256: hash("[]"),
    derivedBoxSha256: hash(JSON.stringify(box)),
    effectivePbpSha256: hash(JSON.stringify(pbp)),
    outcomes: {
      home: {
        status: "unavailable",
        error: "Invalid official report shift interval",
      },
      away: {
        status: "unavailable",
        error: "Invalid official report shift interval",
      },
    },
    evidence: [],
    review: {
      reason:
        "Both reports corrupt; no API shifts. Reviewed source evidence preserved.",
      evidenceSha256: "f".repeat(64),
    },
  };
  const add = async (role: string, url: string, body: unknown) => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    await writeFile(join(directory, hash(url) + ".bin"), text);
    await writeFile(
      join(directory, hash(url) + ".json"),
      JSON.stringify({ url, sha256: hash(text) }),
    );
    proof.evidence.push({ role, url, sha256: hash(text) });
  };
  await add(
    "pbp",
    `https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`,
    pbp,
  );
  await add(
    "box",
    `https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`,
    box,
  );
  await add(
    "schedule",
    "https://api.nhle.com/stats/rest/en/game?cayenneExp=season=20092010%20and%20gameType=2&limit=2000",
    {
      total: 1,
      data: [
        {
          id,
          season: 20092010,
          gameType: 2,
          gameStateId: 7,
          gameDate: pbp.gameDate,
          homeTeamId: 1,
          visitingTeamId: 2,
        },
      ],
    },
  );
  for (const side of ["home", "away"])
    await add(
      `${side}-report`,
      `https://www.nhl.com/scores/htmlreports/20092010/T${side === "home" ? "H" : "V"}020002.HTM`,
      `<title>Time On Ice Report ${side === "home" ? "Home" : "Away"} Team</title><table><tr><td>Game 2</td><td>Thursday, October 1, 2009</td></tr></table><table><tr><td class="playerHeading">88 PASTRNAK, DAVID</td></tr><tr><td>1</td><td>1</td><td>0:00 / 20:00</td><td>0:45 / 19:15</td><td>00:55</td><td></td></tr></table>`,
    );
  await add(
    "shift-page",
    `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId>=${id}%20and%20gameId<=${id}&start=0&limit=10000&sort=${encodeURIComponent(JSON.stringify([{ property: "id", direction: "ASC" }]))}`,
    { total: 0, data: [] },
  );
  for (const kind of ["skater", "goalie"]) {
    const data = [];
    for (const [side, groups] of Object.entries(box.playerByGameStats))
      for (const [group, players] of Object.entries(groups))
        if ((kind === "goalie") === (group === "goalies"))
          for (const p of players)
            data.push({
              gameId: id,
              playerId: p.playerId,
              gamesPlayed: 1,
              homeRoad: side === "homeTeam" ? "H" : "R",
              positionCode: p.position,
              timeOnIce: 1200,
              timeOnIcePerGame: 1200,
              shotsAgainst: p.shotsAgainst,
              goalsAgainst: p.goalsAgainst,
            });
    await add(
      `${kind}-summary`,
      `https://api.nhle.com/stats/rest/en/${kind}/summary?cayenneExp=gameId>=${id}%20and%20gameId<=${id}&start=0&limit=-1&isAggregate=false&isGame=true`,
      { total: data.length, data },
    );
  }
  await cache.saveDerived(
    `box-${id}`,
    box,
    proof.evidence.filter((e) => e.role.endsWith("summary")).map((e) => e.url),
  );
  await cache.saveDerived(
    `shifts-${id}`,
    [],
    proof.evidence.filter((e) => e.role === "shift-page").map((e) => e.url),
  );
  return { cache, proof, pbp, directory };
}
test("offline replay, explicit immutable collection and subsequent loader preserve physical source gaps", async (t) => {
  const f = await fixture(t);
  assert.equal(
    await applyCachedUnavailableShiftProof(f.cache, f.proof.gameId, f.pbp),
    undefined,
  );
  const sources = await loadReviewedUnavailableShifts(f.cache, f.proof, f.pbp),
    rows = extractShotTrainingRows(f.pbp);
  const g = buildGameValueData(
    sources,
    [],
    new Map(rows.map((r) => [r.eventId, 0])),
    0.3,
  );
  assert.equal(g.usableProcessSeconds, 0);
  assert.equal(g.shots.length, rows.length);
  assert.equal(g.eligible, false);
  await collectReviewedUnavailableShiftProof(f.cache, f.proof, f.pbp);
  assert.deepEqual(
    await applyCachedUnavailableShiftProof(f.cache, f.proof.gameId, f.pbp),
    sources,
  );
  const changed = structuredClone(f.proof);
  changed.review.reason = "Different review";
  await assert.rejects(
    () => collectReviewedUnavailableShiftProof(f.cache, changed, f.pbp),
    /conflicts/,
  );
});
test("changed parser/effective input/missing evidence never becomes automatic quarantine", async (t) => {
  const f = await fixture(t);
  const p = structuredClone(f.proof);
  p.parserBindingSha256 = "a".repeat(64);
  await assert.rejects(
    () => loadReviewedUnavailableShifts(f.cache, p, f.pbp),
    /parser binding/,
  );
  await assert.rejects(
    () =>
      loadReviewedUnavailableShifts(f.cache, f.proof, {
        ...f.pbp,
        gameDate: "2009-10-02",
      }),
    /PBP/,
  );
  const missing = structuredClone(f.proof);
  missing.evidence = missing.evidence.filter((e) => e.role !== "shift-page");
  await assert.rejects(
    () => loadReviewedUnavailableShifts(f.cache, missing, f.pbp),
    /Missing/,
  );
  const url = f.proof.evidence[0]!.url;
  await writeFile(join(f.directory, hash(url) + ".bin"), "{}");
  await assert.rejects(
    () => loadReviewedUnavailableShifts(f.cache, f.proof, f.pbp),
    /hash|changed/i,
  );
  assert.throws(
    () => unavailableShiftProofKey(2009020003, "a".repeat(64), "b".repeat(64)),
    /key/,
  );
});

test("reviewed availability belongs to the exact effective PBP and retains earlier proof versions", async (t) => {
  const f = await fixture(t);
  await collectReviewedUnavailableShiftProof(f.cache, f.proof, f.pbp);
  const changedPbp = structuredClone(f.pbp);
  changedPbp.plays[0]!.details = {
    ...changedPbp.plays[0]!.details,
    nhlReportPenaltyShot: true,
  };
  const originalKey = unavailableShiftProofKey(
    f.proof.gameId,
    f.proof.parserBindingSha256,
    f.proof.effectivePbpSha256,
  );
  const changedKey = unavailableShiftProofKey(
    f.proof.gameId,
    f.proof.parserBindingSha256,
    hash(JSON.stringify(changedPbp)),
  );
  assert.notEqual(originalKey, changedKey);
  assert.equal(
    await applyCachedUnavailableShiftProof(f.cache, f.proof.gameId, changedPbp),
    undefined,
  );
  assert.deepEqual(await f.cache.derived(originalKey), f.proof);
  assert.equal(await f.cache.derived(changedKey), undefined);
  assert.throws(
    () =>
      unavailableShiftProofKey(
        f.proof.gameId,
        f.proof.parserBindingSha256,
        "invalid",
      ),
    /key/,
  );
});

test("online caller cannot refetch a missing retained proof body", async (t) => {
  const f = await fixture(t);
  const entry = f.proof.evidence.find((e) => e.role === "away-report")!;
  await rm(join(f.directory, hash(entry.url) + ".bin"));
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    networkCalls++;
    throw new Error("Network must not be called");
  });
  await assert.rejects(
    () =>
      loadReviewedUnavailableShifts(
        new HockeyDataCache(f.directory, false),
        f.proof,
        f.pbp,
      ),
    /Offline cache miss/,
  );
  assert.equal(networkCalls, 0);
});

test("filtered official queries cannot masquerade as complete API absence", async (t) => {
  const f = await fixture(t);
  const changed = structuredClone(f.proof);
  changed.evidence.find((e) => e.role === "shift-page")!.url += "&playerId=999";
  await assert.rejects(
    () => loadReviewedUnavailableShifts(f.cache, changed, f.pbp),
    /scope/,
  );
  const mixed = structuredClone(f.proof);
  const row = mixed.evidence.find((e) => e.role === "goalie-summary")!;
  row.url = row.url.replace("gameId>=2009020002", "gameId>=2009020001");
  await assert.rejects(
    () => loadReviewedUnavailableShifts(f.cache, mixed, f.pbp),
    /scope/,
  );
});

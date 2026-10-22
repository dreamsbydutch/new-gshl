import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HockeyDataCache } from "./game-value-source";
import {
  boundaryShiftFixture,
  retainedBoundary2008Fixtures,
} from "../../domains/nhl/boundary-shift-fixtures";
import {
  reconcileBoundaryShiftReports,
  type BoundaryShiftProof,
} from "../../domains/nhl/boundary-shift-reconciliation";
import {
  boundaryShiftParserBinding,
  boundaryShiftProofKey,
  loadReviewedBoundaryShifts,
  collectReviewedBoundaryShiftProof,
  applyCachedBoundaryShiftProof,
} from "./boundary-shift-source";
const hash = (b: Uint8Array | string) =>
  createHash("sha256").update(b).digest("hex");
test("2008 reviewed scope requires the exact 2008 reports/calendar and rejects mixed-year REST evidence without acquisition", async () => {
  const f = retainedBoundary2008Fixtures().find(
      (f) => f.pbp.id === 2008020021,
    )!,
    binding = await boundaryShiftParserBinding();
  const proof: BoundaryShiftProof = {
    version: "nhl-reviewed-boundary-shifts-v1",
    gameId: f.pbp.id,
    parserBindingSha256: binding.sha256,
    derivedShiftsSha256: hash("[]"),
    derivedBoxSha256: hash(JSON.stringify(f.box)),
    effectivePbpSha256: hash(JSON.stringify(f.pbp)),
    recoveredShiftsSha256: "a".repeat(64),
    reconciliationSha256: "b".repeat(64),
    review: {
      reason: "Retained 2008 exact source scope test",
      evidenceSha256: "c".repeat(64),
    },
    evidence: [
      {
        role: "shift-page",
        url:
          "https://api.nhle.com/stats/rest/en/shiftcharts?" +
          new URLSearchParams({
            cayenneExp: "gameId>=2009020001 and gameId<=2009020100",
            start: "0",
            limit: "10000",
            sort: JSON.stringify([{ property: "id", direction: "ASC" }]),
          }),
        sha256: "d".repeat(64),
      },
      {
        role: "pbp",
        url: `https://api-web.nhle.com/v1/gamecenter/${f.pbp.id}/play-by-play`,
        sha256: "d".repeat(64),
      },
      {
        role: "home-report",
        url: "https://www.nhl.com/scores/htmlreports/20082009/TH020021.HTM",
        sha256: "d".repeat(64),
      },
      {
        role: "away-report",
        url: "https://www.nhl.com/scores/htmlreports/20082009/TV020021.HTM",
        sha256: "d".repeat(64),
      },
      {
        role: "schedule",
        url: "https://api.nhle.com/stats/rest/en/game?cayenneExp=season=20082009%20and%20gameType=2&limit=2000",
        sha256: "d".repeat(64),
      },
      {
        role: "skater-summary",
        url: "https://example.test/skater",
        sha256: "d".repeat(64),
      },
      {
        role: "goalie-summary",
        url: "https://example.test/goalie",
        sha256: "d".repeat(64),
      },
    ],
  };
  let reads = 0;
  class Cache extends HockeyDataCache {
    override async retainedBytes(): Promise<Buffer> {
      reads++;
      throw Error("Unexpected retained access");
    }
    override async bytes(): Promise<Buffer> {
      throw Error("Unexpected acquisition");
    }
  }
  await assert.rejects(
    loadReviewedBoundaryShifts(new Cache("unused", true), proof, f.pbp),
    /scope/,
  );
  assert.equal(reads, 0);
  const changed = structuredClone(proof);
  changed.evidence.find((e) => e.role === "schedule")!.url = changed.evidence
    .find((e) => e.role === "schedule")!
    .url.replace("20082009", "20092010");
  await assert.rejects(
    loadReviewedBoundaryShifts(new Cache("unused", true), changed, f.pbp),
    /schedule evidence/,
  );
  assert.equal(reads, 0);
});
async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "boundary-shifts-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = boundaryShiftFixture(),
    cache = new HockeyDataCache(directory, true),
    result = reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []),
    proof: BoundaryShiftProof = {
      version: "nhl-reviewed-boundary-shifts-v1",
      gameId: f.pbp.id,
      parserBindingSha256: (await boundaryShiftParserBinding()).sha256,
      evidence: [],
      derivedShiftsSha256: hash("[]"),
      derivedBoxSha256: hash(JSON.stringify(f.box)),
      effectivePbpSha256: hash(JSON.stringify(f.pbp)),
      recoveredShiftsSha256: hash(JSON.stringify(result.shifts)),
      reconciliationSha256: hash(JSON.stringify(result.shiftRecovery)),
      review: {
        reason:
          "Independently reviewed exact boundary endpoints and all official totals",
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
    `https://api-web.nhle.com/v1/gamecenter/${f.pbp.id}/play-by-play`,
    f.pbp,
  );
  for (const side of ["home", "away"] as const)
    await add(
      `${side}-report`,
      `https://www.nhl.com/scores/htmlreports/20092010/T${side === "home" ? "H" : "V"}020157.HTM`,
      f.reports[side],
    );
  await add(
    "schedule",
    "https://api.nhle.com/stats/rest/en/game?cayenneExp=season=20092010%20and%20gameType=2&limit=2000",
    {
      total: 1,
      data: [
        {
          id: f.pbp.id,
          season: 20092010,
          gameType: 2,
          gameStateId: 7,
          gameDate: f.pbp.gameDate,
          homeTeamId: 1,
          visitingTeamId: 2,
        },
      ],
    },
  );
  const range = `gameId>=${f.pbp.id} and gameId<=${f.pbp.id}`;
  const params = new URLSearchParams({
    cayenneExp: range,
    start: "0",
    limit: "10000",
    sort: JSON.stringify([{ property: "id", direction: "ASC" }]),
  });
  await add(
    "shift-page",
    `https://api.nhle.com/stats/rest/en/shiftcharts?${params}`,
    { total: 0, data: [] },
  );
  for (const kind of ["skater", "goalie"]) {
    const data = [];
    for (const [side, groups] of Object.entries(f.box.playerByGameStats))
      for (const [group, players] of Object.entries(groups))
        if ((kind === "goalie") === (group === "goalies"))
          for (const p of players) {
            const roster = f.pbp.rosterSpots.find(
              (r) => r.playerId === p.playerId,
            )!;
            const seconds =
              Number(p.toi.split(":")[0]) * 60 + Number(p.toi.split(":")[1]);
            data.push({
              gameId: f.pbp.id,
              playerId: p.playerId,
              gamesPlayed: 1,
              homeRoad: side === "homeTeam" ? "H" : "R",
              positionCode: roster.positionCode,
              timeOnIce: seconds,
              timeOnIcePerGame: seconds,
              shotsAgainst: "shotsAgainst" in p ? p.shotsAgainst : 0,
              goalsAgainst: "goalsAgainst" in p ? p.goalsAgainst : 0,
            });
          }
    const query = new URLSearchParams({
      isAggregate: "false",
      isGame: "true",
      start: "0",
      limit: "-1",
      cayenneExp: range,
    });
    await add(
      `${kind}-summary`,
      `https://api.nhle.com/stats/rest/en/${kind}/summary?${query}`,
      { total: data.length, data },
    );
  }
  await cache.saveDerived(
    `box-${f.pbp.id}`,
    f.box,
    proof.evidence.filter((e) => e.role.endsWith("summary")).map((e) => e.url),
  );
  await cache.saveDerived(
    `shifts-${f.pbp.id}`,
    [],
    proof.evidence.filter((e) => e.role === "shift-page").map((e) => e.url),
  );
  return { ...f, cache, proof, directory };
}
test("immutable reviewed boundary proof replays before every use and preserves all original public bodies", async (t) => {
  const f = await fixture(t),
    before = await Promise.all(
      f.proof.evidence.map((e) =>
        readFile(join(f.directory, hash(e.url) + ".bin")),
      ),
    ),
    loaded = await loadReviewedBoundaryShifts(f.cache, f.proof, f.pbp);
  assert.equal(loaded.shiftRecovery.players.length, 6);
  await collectReviewedBoundaryShiftProof(f.cache, f.proof, f.pbp);
  const replay = await applyCachedBoundaryShiftProof(f.cache, f.pbp.id, f.pbp);
  assert.deepEqual(replay, loaded);
  for (const [i, e] of f.proof.evidence.entries())
    assert.deepEqual(
      await readFile(join(f.directory, hash(e.url) + ".bin")),
      before[i],
    );
  assert.ok(
    await f.cache.derived(
      boundaryShiftProofKey(
        f.pbp.id,
        f.proof.parserBindingSha256,
        f.proof.effectivePbpSha256,
      ),
    ),
  );
});
test("changed proof/code/output and hidden API filters cannot grant recovery", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    loadReviewedBoundaryShifts(
      f.cache,
      { ...f.proof, recoveredShiftsSha256: "a".repeat(64) },
      f.pbp,
    ),
    /reconciliation changed/,
  );
  await assert.rejects(
    loadReviewedBoundaryShifts(
      f.cache,
      { ...f.proof, parserBindingSha256: "a".repeat(64) },
      f.pbp,
    ),
    /binding changed/,
  );
  const proof = structuredClone(f.proof);
  proof.evidence.find((e) => e.role === "shift-page")!.url +=
    "&factCayenneExp=playerId=999";
  await assert.rejects(
    loadReviewedBoundaryShifts(f.cache, proof, f.pbp),
    /scope/,
  );
  const changed = structuredClone(f.pbp);
  changed.plays[0]!.timeInPeriod = "10:01";
  await assert.rejects(
    loadReviewedBoundaryShifts(f.cache, f.proof, changed),
    /PBP/,
  );
});
test("missing or corrupted retained bodies never refetch or become a generic repair", async (t) => {
  const f = await fixture(t),
    entry = f.proof.evidence[0]!;
  await writeFile(
    join(f.directory, hash(entry.url) + ".bin"),
    "changed original",
  );
  await assert.rejects(
    loadReviewedBoundaryShifts(f.cache, f.proof, f.pbp),
    /hash mismatch/,
  );
  assert.equal(
    await applyCachedBoundaryShiftProof(f.cache, 2009020002, f.pbp),
    undefined,
  );
  assert.throws(
    () =>
      boundaryShiftProofKey(
        2009020002,
        f.proof.parserBindingSha256,
        f.proof.effectivePbpSha256,
      ),
    /Invalid/,
  );
});

test("effective PBP identities isolate reviewed shifts without replacing any prior proof", async (t) => {
  const f = await fixture(t),
    oldKey = `reviewed-boundary-shifts-${f.pbp.id}-${f.proof.parserBindingSha256}`;
  await f.cache.saveDerived(
    oldKey,
    f.proof,
    f.proof.evidence.map((e) => e.url),
  );
  assert.equal(
    await applyCachedBoundaryShiftProof(f.cache, f.pbp.id, f.pbp),
    undefined,
  );
  await collectReviewedBoundaryShiftProof(f.cache, f.proof, f.pbp);
  const changed = structuredClone(f.pbp);
  Object.assign(changed.plays[0]!.details, { nhlReportPenaltyShot: true });
  const key = boundaryShiftProofKey(
      f.pbp.id,
      f.proof.parserBindingSha256,
      f.proof.effectivePbpSha256,
    ),
    changedKey = boundaryShiftProofKey(
      f.pbp.id,
      f.proof.parserBindingSha256,
      hash(JSON.stringify(changed)),
    );
  assert.notEqual(changedKey, key);
  assert.equal(
    await applyCachedBoundaryShiftProof(f.cache, f.pbp.id, changed),
    undefined,
  );
  assert.deepEqual(await f.cache.derived(oldKey), f.proof);
  assert.deepEqual(await f.cache.derived(key), f.proof);
  assert.equal(await f.cache.derived(changedKey), undefined);
  assert.throws(
    () =>
      boundaryShiftProofKey(f.pbp.id, f.proof.parserBindingSha256, "invalid"),
    /Invalid/,
  );
});

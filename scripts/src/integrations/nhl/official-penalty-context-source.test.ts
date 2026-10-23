import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { HockeyDataCache } from "./game-value-source";
import {
  withOfficialPenaltyContexts,
  withReviewedOvertimeClock,
} from "./official-penalty-context-source";
import { gameFixture } from "../../domains/nhl/game-value-fixtures";
import { buildGameValueData } from "../../domains/nhl/game-value-input";
import type { GameSourceBundle } from "./game-value-source";

const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
async function realFixture(name = "reviewed-2008-penalty-context.json.gz") {
  const bytes = await readFile(
    new URL(`../../domains/nhl/fixtures/${name}`, import.meta.url),
  );
  return JSON.parse(gunzipSync(bytes).toString("utf8")) as {
    pbp: {
      id: number;
      gameDate: string;
      homeTeam: { id: number };
      awayTeam: { id: number };
    };
    box: unknown;
    shifts: unknown[];
    html: string;
  };
}

class NoSourceAccessCache extends HockeyDataCache {
  reads = 0;
  override async retainedBytes(_url: string): Promise<Buffer> {
    this.reads++;
    throw Error("Unexpected source access");
  }
  override async bytes(): Promise<Buffer> {
    throw Error("Network/cache acquisition is forbidden");
  }
  override async saveDerived(): Promise<void> {
    throw Error("Source writes are forbidden");
  }
}

class RetainedFixtureCache extends NoSourceAccessCache {
  constructor(private bodies: Map<string, Buffer>) {
    super("unused", true);
  }
  override async retainedBytes(url: string): Promise<Buffer> {
    this.reads++;
    const body = this.bodies.get(url);
    if (!body) throw Error("Missing retained fixture source");
    return Buffer.from(body);
  }
}

test("retained completed-shootout evidence changes only elapsed period ends and binds detached proofs", async () => {
  const fixture = JSON.parse(
    gunzipSync(
      await readFile(
        new URL(
          "../../domains/nhl/fixtures/reviewed-2008-overtime-clock.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );
  for (const c of fixture.cases) {
    const gameId = c.input.pbp.id;
    const suffix = String(gameId % 1e6).padStart(6, "0");
    const urls = [
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
      ...["PL", "TH", "TV"].map(
        (prefix) =>
          `https://www.nhl.com/scores/htmlreports/20082009/${prefix}${suffix}.HTM`,
      ),
    ];
    const bodies = [
      c.reports.rawPbpJson,
      c.reports.playReportHtml,
      c.reports.homeShiftReportHtml,
      c.reports.awayShiftReportHtml,
    ];
    const cache = new RetainedFixtureCache(
      new Map(urls.map((url, index) => [url, Buffer.from(bodies[index])])),
    );
    const sources: GameSourceBundle = {
      ...c.input,
      shiftSource: "nhl-toi-report",
    };
    const before = structuredClone(sources);
    const result = await withReviewedOvertimeClock(cache, gameId, sources);
    assert.deepEqual(sources, before);
    const {
      reviewedOvertimeClock: proof,
      officialPeriodEnds,
      ...facts
    } = result;
    assert.ok(proof);
    const { officialPeriodEnds: _old, ...originalFacts } = sources;
    assert.deepEqual(facts, originalFacts);
    assert.deepEqual(officialPeriodEnds, [{ period: 4, seconds: 300 }]);
    assert.equal(
      proof.originalPreClockBundleSha256,
      hash(JSON.stringify(sources)),
    );
    assert.equal(
      proof.postClockBundleSha256,
      hash(JSON.stringify({ ...sources, officialPeriodEnds })),
    );
    assert.equal(buildGameValueData(result, []).gameSeconds, 3900);
    const replay = await withReviewedOvertimeClock(cache, gameId, sources);
    assert.deepEqual(replay, result);
    await assert.rejects(
      withReviewedOvertimeClock(cache, gameId, result),
      /original source bundle/,
    );
    assert.equal(cache.reads, 8);
  }
});

test("clock recovery does not access sources outside its exact five-game scope", async () => {
  const sources: GameSourceBundle = {
    ...gameFixture().sources,
    shiftSource: "nhl-api",
  };
  const cache = new NoSourceAccessCache("unused", true);
  for (const id of [2008020009, 2008030012, 2009020012])
    assert.equal(await withReviewedOvertimeClock(cache, id, sources), sources);
  assert.equal(cache.reads, 0);
});

test("real primary penalty context changes only missing ledger strengths and binds reproducible retained sources", async () => {
  const fixture = await realFixture();
  const sources: GameSourceBundle = {
    pbp: fixture.pbp,
    box: fixture.box,
    shifts: fixture.shifts,
    shiftSource: "nhl-toi-report",
  };
  const game = buildGameValueData(sources, []);
  const before = structuredClone({ sources, game });
  const rawBytes = Buffer.from(JSON.stringify(fixture.pbp)),
    reportBytes = Buffer.from(fixture.html);
  const rawUrl = `https://api-web.nhle.com/v1/gamecenter/${game.gameId}/play-by-play`;
  const reportUrl = `https://www.nhl.com/scores/htmlreports/20082009/PL${String(game.gameId % 1e6).padStart(6, "0")}.HTM`;
  const cache = new RetainedFixtureCache(
    new Map([
      [rawUrl, rawBytes],
      [reportUrl, reportBytes],
    ]),
  );
  const result = await withOfficialPenaltyContexts(cache, sources, game);
  assert.deepEqual({ sources, game }, before);
  assert.notEqual(result.game, game);
  const { penalties: beforePenalties, ...beforePhysics } = game;
  const { penalties: afterPenalties, ...afterPhysics } = result.game;
  assert.deepEqual(afterPhysics, beforePhysics);
  assert.equal(afterPenalties.length, beforePenalties.length);
  assert.ok(
    afterPenalties.some((p) => p.homeBefore !== null && p.awayBefore !== null),
  );
  const { penaltyContextRecovery: proof, ...originalSources } = result.sources;
  assert.ok(proof);
  assert.deepEqual(originalSources, sources);
  assert.equal(proof.sources.rawPbp.sha256, hash(rawBytes));
  assert.equal(proof.sources.playReport.sha256, hash(reportBytes));
  assert.equal(proof.sources.baseBundleSha256, hash(JSON.stringify(sources)));
  assert.equal(
    proof.beforePenaltiesSha256,
    hash(JSON.stringify(beforePenalties)),
  );
  assert.equal(
    proof.afterPenaltiesSha256,
    hash(JSON.stringify(afterPenalties)),
  );
  assert.deepEqual(proof.beforePenalties, beforePenalties);
  assert.deepEqual(proof.afterPenalties, afterPenalties);
  assert.ok(proof.codeHashes.every((row) => /^[a-f0-9]{64}$/.test(row.sha256)));
  const repeated = await withOfficialPenaltyContexts(cache, sources, game);
  assert.deepEqual(repeated, result);
  assert.notEqual(
    hash(JSON.stringify(result.sources)),
    hash(JSON.stringify(sources)),
  );
  assert.equal(cache.reads, 4);
});

test("a rejected primary report identifies its game and retains the original failure", async () => {
  const fixture = await realFixture(
    "reviewed-2008-penalty-context-control.json.gz",
  );
  const sources: GameSourceBundle = {
    pbp: fixture.pbp,
    box: fixture.box,
    shifts: fixture.shifts,
    shiftSource: "nhl-toi-report",
  };
  const game = buildGameValueData(sources, []);
  const rawUrl = `https://api-web.nhle.com/v1/gamecenter/${game.gameId}/play-by-play`;
  const reportUrl = `https://www.nhl.com/scores/htmlreports/20082009/PL${String(game.gameId % 1e6).padStart(6, "0")}.HTM`;
  const cache = new RetainedFixtureCache(
    new Map([
      [rawUrl, Buffer.from(JSON.stringify(fixture.pbp))],
      [reportUrl, Buffer.from(fixture.html + "<!-- unreviewed body -->")],
    ]),
  );
  const before = structuredClone({ sources, game });
  await assert.rejects(
    withOfficialPenaltyContexts(cache, sources, game),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Penalty context game 2008020012:/);
      assert.ok(error.cause instanceof Error);
      return true;
    },
  );
  assert.deepEqual({ sources, game }, before);
});

test("retained raw game identity must agree before penalty recovery", async () => {
  const fixture = await realFixture();
  const sources: GameSourceBundle = {
    pbp: fixture.pbp,
    box: fixture.box,
    shifts: fixture.shifts,
    shiftSource: "nhl-toi-report",
  };
  const game = buildGameValueData(sources, []);
  const rawUrl = `https://api-web.nhle.com/v1/gamecenter/${game.gameId}/play-by-play`;
  const reportUrl = `https://www.nhl.com/scores/htmlreports/20082009/PL${String(game.gameId % 1e6).padStart(6, "0")}.HTM`;
  const cache = new RetainedFixtureCache(
    new Map([
      [
        rawUrl,
        Buffer.from(JSON.stringify({ ...fixture.pbp, id: game.gameId + 1 })),
      ],
      [reportUrl, Buffer.from(fixture.html)],
    ]),
  );
  await assert.rejects(
    withOfficialPenaltyContexts(cache, sources, game),
    /raw game identity differs/,
  );
});

test("penalty-context recovery leaves other seasons and playoffs untouched without source access", async () => {
  const fixture = gameFixture();
  const sources: GameSourceBundle = {
    ...fixture.sources,
    shiftSource: "nhl-api",
  };
  for (const gameId of [2007020001, 2008030001, 2009020001, 2024020999]) {
    const game = {
      ...buildGameValueData(fixture.sources, fixture.shots),
      gameId,
    };
    const cache = new NoSourceAccessCache("unused", true);
    const before = structuredClone({ sources, game });
    const result = await withOfficialPenaltyContexts(cache, sources, game);
    assert.equal(result.sources, sources);
    assert.equal(result.game, game);
    assert.equal(cache.reads, 0);
    assert.deepEqual({ sources, game }, before);
  }
});

test("an already supplemented bundle cannot be used as a fresh penalty source", async () => {
  const fixture = gameFixture();
  const game = {
    ...buildGameValueData(fixture.sources, fixture.shots),
    gameId: 2008020001,
  };
  const cache = new NoSourceAccessCache("unused", true);
  const supplemented = {
    ...fixture.sources,
    shiftSource: "nhl-api" as const,
    penaltyContextRecovery: undefined,
  };
  await assert.rejects(
    withOfficialPenaltyContexts(cache, supplemented, game),
    /original source bundle/,
  );
  assert.equal(cache.reads, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HockeyDataCache, fetchGamePlayByPlay } from "./game-value-source";
import {
  collectReviewedEventSourceAvailability,
  replayReviewedEventSourceAvailability,
  applyCachedReviewedEventSourceAvailability,
  isWhollyUnavailableReviewedEventGame,
} from "./reviewed-event-source-availability-source";
const hash = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
async function fixture(t: { after: (f: () => Promise<unknown>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), "reviewed-event-availability-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const raw = {
    id: 2008020259,
    gameDate: "2008-11-17",
    gameType: 2,
    gameState: "OFF",
    homeTeam: { id: 10 },
    awayTeam: { id: 6 },
    rosterSpots: [
      { playerId: 1, positionCode: "C" },
      { playerId: 2, positionCode: "G" },
    ],
    plays: [
      {
        eventId: 1,
        sortOrder: 1,
        typeDescKey: "shot-on-goal",
        periodDescriptor: { number: 1, periodType: "REG" },
        timeInPeriod: "05:00",
        details: {
          shootingPlayerId: 1,
          goalieInNetId: 2,
          eventOwnerTeamId: 10,
        },
      },
    ],
  };
  const urls = [
    `https://api-web.nhle.com/v1/gamecenter/${raw.id}/play-by-play`,
    "https://www.nhl.com/scores/htmlreports/20082009/PL020259.HTM",
    "https://www.nhl.com/scores/htmlreports/20082009/GS020259.HTM",
    "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip",
  ];
  const bodies = [
    Buffer.from(JSON.stringify(raw, null, 2)),
    Buffer.from("<title>Play By Play</title>"),
    Buffer.from("<title>Game Summary</title>"),
    Buffer.from(
      "controlled retained archive fixture; availability proof never uses prediction fields",
    ),
  ];
  for (let i = 0; i < urls.length; i++) {
    await writeFile(join(dir, hash(urls[i]!) + ".bin"), bodies[i]!);
    await writeFile(
      join(dir, hash(urls[i]!) + ".json"),
      JSON.stringify({ url: urls[i], sha256: hash(bodies[i]!) }),
    );
  }
  return { dir, raw, urls, bodies, cache: new HockeyDataCache(dir, true) };
}

test("missing metadata proof preserves input identity without source access", async () => {
  class Empty extends HockeyDataCache {
    reads = 0;
    constructor() {
      super("unused-event-availability", true);
    }
    override async derived<T>(): Promise<T | undefined> {
      return undefined;
    }
    override async retainedBytes(): Promise<Buffer> {
      this.reads++;
      throw Error("Unexpected source read");
    }
  }
  const cache = new Empty(),
    raw = { id: 2024020001 };
  assert.equal(
    await applyCachedReviewedEventSourceAvailability(
      cache,
      raw.id,
      raw,
      "a".repeat(64),
    ),
    raw,
  );
  assert.equal(cache.reads, 0);
});

test("explicit collection adds only metadata and getter preserves all native events/rosters", async (t) => {
  const f = await fixture(t);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("No public acquisition");
  });
  const originals = await readdir(f.dir),
    before = await Promise.all(originals.map((n) => readFile(join(f.dir, n))));
  const proof = await collectReviewedEventSourceAvailability(f.cache, f.raw.id);
  assert.deepEqual(proof.unavailablePeriods, [1, 2, 3, 4]);
  assert.equal(isWhollyUnavailableReviewedEventGame(f.raw.id), true);
  const loaded = await fetchGamePlayByPlay(f.cache, f.raw.id);
  assert.deepEqual(loaded.plays, f.raw.plays);
  assert.deepEqual(
    (loaded as unknown as typeof f.raw).rosterSpots,
    f.raw.rosterSpots,
  );
  assert.ok("reviewedEventSourceAvailability" in loaded);
  assert.deepEqual(await fetchGamePlayByPlay(f.cache, f.raw.id), loaded);
  assert.deepEqual(
    await applyCachedReviewedEventSourceAvailability(
      f.cache,
      f.raw.id,
      loaded,
      hash(f.bodies[0]!),
    ),
    loaded,
  );
  const files = await readdir(f.dir);
  assert.equal(files.length, originals.length + 1);
  assert.ok(
    files.some(
      (n) =>
        n ===
        "derived-reviewed-event-source-availability-v1-2008020259.json.gz",
    ),
  );
  for (let i = 0; i < originals.length; i++)
    assert.deepEqual(await readFile(join(f.dir, originals[i]!)), before[i]);
  await collectReviewedEventSourceAvailability(f.cache, f.raw.id);
  assert.deepEqual(await readdir(f.dir), files);
  assert.equal(requests, 0);
});

test("stale input and missing retained bodies fail without network or proof replacement", async (t) => {
  const f = await fixture(t);
  await collectReviewedEventSourceAvailability(f.cache, f.raw.id);
  let reads = 0;
  const probe = t.mock.method(f.cache, "retainedBytes", async () => {
    reads++;
    throw Error("Unexpected retained read");
  });
  await assert.rejects(
    applyCachedReviewedEventSourceAvailability(
      f.cache,
      f.raw.id,
      { ...f.raw, gameDate: "2008-11-18" },
      hash(f.bodies[0]!),
    ),
    /original input changed/,
  );
  assert.equal(reads, 0);
  probe.mock.restore();
  const before = await readFile(
    join(
      f.dir,
      "derived-reviewed-event-source-availability-v1-2008020259.json.gz",
    ),
  );
  await rm(join(f.dir, hash(f.urls[0]!) + ".bin"));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("Forbidden public request");
  });
  await assert.rejects(
    replayReviewedEventSourceAvailability(
      new HockeyDataCache(f.dir, false),
      f.raw.id,
    ),
    /Offline cache missing/,
  );
  assert.equal(requests, 0);
  assert.deepEqual(
    await readFile(
      join(
        f.dir,
        "derived-reviewed-event-source-availability-v1-2008020259.json.gz",
      ),
    ),
    before,
  );
});

test("collection cannot expand the four-game scope", async () => {
  class Probe extends HockeyDataCache {
    reads = 0;
    constructor() {
      super("unused-event-scope", false);
    }
    override async bytes(): Promise<Buffer> {
      this.reads++;
      throw Error("Unexpected source acquisition");
    }
  }
  const cache = new Probe();
  await assert.rejects(
    collectReviewedEventSourceAvailability(cache, 2008020260),
    /outside reviewed scope/,
  );
  assert.equal(cache.reads, 0);
});

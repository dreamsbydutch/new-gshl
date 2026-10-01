import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HockeyDataCache, fetchPenaltyShotHistory } from "./game-value-source";
import { loadVerifiedGame } from "../../domains/nhl/verified-game-source";
import { gameFixture } from "../../domains/nhl/game-value-fixtures";

test("penalty-shot history follows capped pages using actual returned row counts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nhl-penalty-history-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const rows = [1, 2, 3].map((playerId) => ({
    seasonId: 20232024,
    playerId,
    penaltyShotAttempts: 1,
    penaltyShotsGoals: 0,
  }));
  for (const start of [0, 2]) {
    const params = new URLSearchParams({
      isAggregate: "false",
      isGame: "false",
      start: String(start),
      limit: "100",
      sort: JSON.stringify([
        { property: "seasonId", direction: "ASC" },
        { property: "playerId", direction: "ASC" },
      ]),
      cayenneExp: "seasonId>=20192020 and seasonId<20242025 and gameTypeId=2",
    });
    const url = `https://api.nhle.com/stats/rest/en/skater/penaltyShots?${params}`;
    const body = JSON.stringify({
      total: 3,
      data: rows.slice(start, start + 2),
    });
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    await writeFile(join(directory, hash(url) + ".bin"), body);
    await writeFile(
      join(directory, hash(url) + ".json"),
      JSON.stringify({ url, sha256: hash(body) }),
    );
  }
  const history = await fetchPenaltyShotHistory(
    new HockeyDataCache(directory, true),
    20242025,
    2,
  );
  assert.deepEqual(history.rows, rows);
  assert.equal(history.beforeSeason, 20242025);
});

test("alternate reports must fully verify or increase usable exposure without losing individual shots", async (t) => {
  for (const [originalGood, alternateGood, goalConflict] of [
    [false, true, false],
    [false, false, false],
    [true, false, false],
    [false, true, true],
  ]) {
    const directory = await mkdtemp(
      join(tmpdir(), "nhl-shift-selection-test-"),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    const f = gameFixture(),
      id = f.sources.pbp.id;
    if (goalConflict)
      f.sources.pbp.plays.find((p) => p.eventId === 6)!.situationCode = "1451";
    const cache = new HockeyDataCache(directory, true);
    const url = `https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`;
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    const body = JSON.stringify(f.sources.pbp);
    await writeFile(join(directory, hash(url) + ".bin"), body);
    await writeFile(
      join(directory, hash(url) + ".json"),
      JSON.stringify({ url, sha256: hash(body) }),
    );
    const bad = f.sources.shifts.map((s) => ({ ...s, endTime: "19:00" }));
    await cache.saveDerived(`box-${id}`, f.sources.box, [url]);
    await cache.saveDerived(
      `shifts-${id}`,
      originalGood ? f.sources.shifts : bad,
      [url],
    );
    await cache.saveDerived(
      `html-shifts-${id}`,
      alternateGood ? f.sources.shifts : bad,
      [url],
    );
    const result = await loadVerifiedGame(cache, id, f.shots);
    assert.equal(result.review.attempted, !originalGood);
    assert.equal(result.review.accepted, !originalGood && alternateGood);
    assert.equal(
      result.game.eligible,
      !goalConflict && (originalGood || alternateGood),
    );
    assert.equal(
      result.sources.shiftSource,
      !originalGood && alternateGood ? "nhl-toi-report" : "nhl-api",
    );
    assert.deepEqual(
      await cache.derived(`shifts-${id}`),
      originalGood ? f.sources.shifts : bad,
    );
  }
});

test("offline public cache rejects changed bytes and conflicting derived provenance", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nhl-value-cache-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const url = "https://api.nhle.com/stats/rest/en/game?test=fixture";
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const stem = join(directory, hash(url));
  const body = '{"data":[1]}';
  await writeFile(stem + ".bin", body);
  await writeFile(stem + ".json", JSON.stringify({ url, sha256: hash(body) }));
  const cache = new HockeyDataCache(directory, true);
  assert.deepEqual(await cache.json(url), { data: [1] });
  await cache.saveDerived("game-1", { roster: [1] }, [url]);
  await cache.saveDerived("game-1", { roster: [1] }, [url]);
  await assert.rejects(
    cache.saveDerived("game-1", { roster: [2] }, [url]),
    /conflicts/,
  );
  assert.deepEqual(await cache.derived("game-1"), { roster: [1] });
  await writeFile(stem + ".bin", '{"data":[2]}');
  await assert.rejects(cache.bytes(url), /hash mismatch/);
  await writeFile(
    stem + ".json",
    JSON.stringify({ url, sha256: hash("changed") }),
  );
  await assert.rejects(cache.derived("game-1"), /provenance mismatch/);
  const derivedPath = join(directory, "derived-game-1.json");
  const envelope = JSON.parse(await readFile(derivedPath, "utf8"));
  envelope.data.roster = [2];
  await writeFile(derivedPath, JSON.stringify(envelope));
  await assert.rejects(cache.derived("game-1"), /hash mismatch/);
  await assert.rejects(
    cache.bytes("https://example.com/unknown"),
    /Unexpected/,
  );
  await assert.rejects(
    cache.bytes("https://api.nhle.com/missing"),
    /Offline cache missing/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HockeyDataCache } from "./game-value-source";
import {
  collectOfficialOnGoalClassification,
  replayOfficialOnGoalClassification,
  withReviewedOnGoalClassifications,
} from "./official-on-goal-classification-source";

class EmptyReviewCache extends HockeyDataCache {
  sourceReads = 0;
  constructor() {
    super("unused-classification-probe", true);
  }
  override async derived<T>(): Promise<T | undefined> {
    return undefined;
  }
  override async bytes(): Promise<Buffer> {
    this.sourceReads++;
    throw Error("Unexpected public source acquisition");
  }
  override async retainedBytes(): Promise<Buffer> {
    this.sourceReads++;
    throw Error("Unexpected retained source read");
  }
}
const reference = [
  {
    playerId: 1,
    name: "Player",
    position: "F" as const,
    games: 1,
    minutes: 12,
  },
];

test("absent reviewed groups preserve references and perform no source acquisition", async () => {
  const cache = new EmptyReviewCache();
  const result = await withReviewedOnGoalClassifications(
    cache,
    20092010,
    reference,
  );
  assert.equal(result[0], reference[0]);
  assert.equal(cache.sourceReads, 0);
});

test("duplicate references cannot receive source classifications", async () => {
  const cache = new EmptyReviewCache();
  await assert.rejects(
    withReviewedOnGoalClassifications(cache, 20092010, [
      ...reference,
      ...reference,
    ]),
    /population differs/,
  );
  assert.equal(cache.sourceReads, 0);
});

test("an unreviewed collection scope fails before public or retained source access", async () => {
  const cache = new EmptyReviewCache();
  await assert.rejects(
    collectOfficialOnGoalClassification(cache, 2024020001),
    /outside reviewed scope/,
  );
  assert.equal(cache.sourceReads, 0);
});

test("proof replay uses retained sources even when the caller permits network acquisition", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "gshl-classification-replay-"),
  );
  t.after(() => rmdir(directory));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("Proof replay must never acquire a missing public source");
  });
  await assert.rejects(
    replayOfficialOnGoalClassification(
      new HockeyDataCache(directory),
      2009020213,
    ),
    /Offline cache missing/,
  );
  assert.equal(requests, 0);
});

test("retained replay shares decoded-source cache identity while preserving offline subclasses", () => {
  const online = new HockeyDataCache("unused-public-cache");
  assert.equal(online.retainedView(), online.retainedView());
  assert.notEqual(online.retainedView(), online);
  assert.equal(online.retainedView().retainedView(), online.retainedView());
  const offline = new EmptyReviewCache();
  assert.equal(offline.retainedView(), offline);
});

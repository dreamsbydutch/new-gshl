import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { HockeyDataCache } from "./game-value-source";
import {
  applyCachedOfficialShotCredits,
  collectOfficialShotCredits,
} from "./official-shot-credit-source";

class ProbeCache extends HockeyDataCache {
  reads = 0;
  constructor(private readonly proof?: unknown) {
    super("unused-source-probe", true);
  }
  override async derived<T>() {
    return this.proof as T | undefined;
  }
  override async retainedBytes(): Promise<Buffer> {
    this.reads++;
    throw Error("Unexpected source acquisition");
  }
}

test("an absent source proof preserves input identity without source reads", async () => {
  const cache = new ProbeCache(),
    input = { id: 2009020961, plays: [] };
  assert.equal(
    await applyCachedOfficialShotCredits(
      cache,
      input.id,
      input,
      "a".repeat(64),
    ),
    input,
  );
  assert.equal(cache.reads, 0);
});

test("stale raw or effective inputs cannot apply a reviewed credit proof", async () => {
  const input = { id: 2009020961, plays: [] };
  const inputHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  for (const proof of [
    {
      originalRawPbpSha256: "b".repeat(64),
      preOverlayEffectivePbpSha256: inputHash,
    },
    {
      originalRawPbpSha256: "a".repeat(64),
      preOverlayEffectivePbpSha256: "b".repeat(64),
    },
  ]) {
    const cache = new ProbeCache(proof);
    await assert.rejects(
      applyCachedOfficialShotCredits(cache, input.id, input, "a".repeat(64)),
      /input changed/,
    );
    assert.equal(cache.reads, 0);
  }
});

test("collection rejects an unreviewed game before acquiring any source", async () => {
  const cache = new ProbeCache();
  await assert.rejects(
    collectOfficialShotCredits(cache, 2024020001),
    /outside the reviewed/,
  );
  assert.equal(cache.reads, 0);
});

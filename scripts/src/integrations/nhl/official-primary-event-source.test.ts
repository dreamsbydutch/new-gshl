import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HockeyDataCache } from "./game-value-source";
import {
  applyCachedOfficialPrimaryEvents,
  collectOfficialPrimaryEvents,
} from "./official-primary-event-source";
import { collectOfficialShotCredits } from "./official-shot-credit-source";

class ProofCache extends HockeyDataCache {
  reads = 0;
  constructor(private readonly proof?: unknown) {
    super("unused-recovery-probe", true);
  }
  override async derived<T>() {
    return this.proof as T | undefined;
  }
  override async retainedBytes(): Promise<Buffer> {
    this.reads++;
    throw Error("Unexpected source read");
  }
}

test("absent primary recovery preserves the caller input without source access", async () => {
  const cache = new ProofCache(),
    input = { id: 2009020330, plays: [] };
  assert.equal(
    await applyCachedOfficialPrimaryEvents(
      cache,
      input.id,
      input,
      "a".repeat(64),
    ),
    input,
  );
  assert.equal(cache.reads, 0);
});

test("stale original or pre-overlay evidence cannot apply a recovery proof", async () => {
  const input = { id: 2009020330, plays: [] };
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  for (const proof of [
    {
      originalRawPbpSha256: "b".repeat(64),
      preOverlayEffectivePbpSha256: sourceHash,
    },
    {
      originalRawPbpSha256: "a".repeat(64),
      preOverlayEffectivePbpSha256: "b".repeat(64),
    },
  ]) {
    const cache = new ProofCache(proof);
    await assert.rejects(
      applyCachedOfficialPrimaryEvents(cache, input.id, input, "a".repeat(64)),
      /input changed/,
    );
    assert.equal(cache.reads, 0);
  }
});

test("an unreviewed recovery scope fails before any source acquisition", async () => {
  const cache = new ProofCache();
  await assert.rejects(
    collectOfficialPrimaryEvents(cache, 2024020001),
    /outside the reviewed/,
  );
  assert.equal(cache.reads, 0);
});

test("reviewed source installation cannot acquire missing inputs from an online cache", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gshl-reviewed-install-"));
  t.after(() => rmdir(directory));
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("Installation must use independently acquired sources");
  });
  const cache = new HockeyDataCache(directory);
  await assert.rejects(
    collectOfficialShotCredits(cache, 2009020961),
    /Offline cache missing/,
  );
  await assert.rejects(
    collectOfficialPrimaryEvents(cache, 2009020330),
    /Offline cache missing/,
  );
  assert.equal(requests, 0);
});

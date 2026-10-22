import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { HockeyDataCache } from "./game-value-source";
import {
  applyCachedReviewed2008ShotCredits,
  replayReviewed2008ShotCredits,
  reviewed2008ShotCreditUrls,
} from "./reviewed-2008-shot-credit-source";
const raw = { id: 2008020157, plays: [] };
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
test("unselected precursor keeps source identity without acquisition", async () => {
  class Cache extends HockeyDataCache {
    override async derived<T>(): Promise<T | undefined> {
      return undefined;
    }
    override async bytes(): Promise<Buffer> {
      throw Error("Unexpected acquisition");
    }
  }
  assert.equal(
    await applyCachedReviewed2008ShotCredits(
      new Cache("unused", true),
      raw.id,
      raw,
      "a".repeat(64),
    ),
    raw,
  );
  assert.throws(
    () => reviewed2008ShotCreditUrls(2008020158),
    /outside reviewed scope/,
  );
});
test("precursor without a paired bridge fails before source reads", async () => {
  class Cache extends HockeyDataCache {
    override async derived<T>(key: string): Promise<T | undefined> {
      return key.startsWith("reviewed-2008-")
        ? ({
            rawPbpSha256: "a".repeat(64),
            preOverlayPbpSha256: sha(JSON.stringify(raw)),
          } as T)
        : undefined;
    }
    override async bytes(): Promise<Buffer> {
      throw Error("Unexpected acquisition");
    }
  }
  await assert.rejects(
    applyCachedReviewed2008ShotCredits(
      new Cache("unused", true),
      raw.id,
      raw,
      "a".repeat(64),
    ),
    /requires its complete historical bridge/,
  );
});
test("changed native input fails before any companion or retained-source access", async () => {
  class Cache extends HockeyDataCache {
    override async derived<T>(key: string): Promise<T | undefined> {
      if (!key.startsWith("reviewed-2008-"))
        throw Error("Unexpected bridge read");
      return {
        rawPbpSha256: "b".repeat(64),
        preOverlayPbpSha256: sha(JSON.stringify(raw)),
      } as T;
    }
  }
  await assert.rejects(
    applyCachedReviewed2008ShotCredits(
      new Cache("unused", true),
      raw.id,
      raw,
      "a".repeat(64),
    ),
    /original input changed/,
  );
});
test("public-enabled callers cannot acquire missing evidence during replay", async () => {
  let requests = 0;
  class Cache extends HockeyDataCache {
    override async bytes(): Promise<Buffer> {
      requests++;
      throw Error("Network attempted");
    }
    override async retainedBytes(): Promise<Buffer> {
      throw Error("Retained evidence missing");
    }
  }
  await assert.rejects(
    replayReviewed2008ShotCredits(new Cache("unused", false), raw.id),
    /Retained evidence missing/,
  );
  assert.equal(requests, 0);
});

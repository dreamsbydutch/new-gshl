import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { HockeyDataCache, type GameSourceBundle } from "./game-value-source";
import { withOfficialPenaltyContexts } from "./official-penalty-context-source";
import { withRetrospectivePenaltyContexts } from "./retrospective-value-context";
import {
  buildGameValueData,
  extractShotTrainingRows,
} from "../../domains/nhl/game-value-input";
import { valuePenaltyEvents } from "../../runtime/nhl-game-season-value";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function fixture() {
  const f = JSON.parse(
    gunzipSync(
      await readFile(
        new URL(
          "../../domains/nhl/fixtures/reviewed-2008-penalty-context.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );
  class Cache extends HockeyDataCache {
    override async retainedBytes(url: string) {
      if (
        url === "https://api-web.nhle.com/v1/gamecenter/2008020009/play-by-play"
      )
        return Buffer.from(JSON.stringify(f.pbp));
      if (
        url === "https://www.nhl.com/scores/htmlreports/20082009/PL020009.HTM"
      )
        return Buffer.from(f.html);
      throw Error("Unexpected retained source");
    }
    override async bytes(): Promise<Buffer> {
      throw Error("Network forbidden");
    }
    override async saveDerived(): Promise<void> {
      throw Error("Writes forbidden");
    }
  }
  const sources: GameSourceBundle = {
    pbp: f.pbp,
    box: f.box,
    shifts: f.shifts,
    shiftSource: "nhl-toi-report",
  };
  return {
    sources,
    loaded: await withOfficialPenaltyContexts(
      new Cache("unused", true),
      sources,
      buildGameValueData(sources, []),
    ),
  };
}
const reviewed = fixture();
test("both fitted shot-probability arms retain the real verified penalty ledger and price its contributions", async () => {
  const { sources, loaded } = await reviewed;
  const proof = loaded.sources.penaltyContextRecovery!;
  for (const probability of [0.1, 0.3]) {
    const probabilities = new Map(
      extractShotTrainingRows(sources.pbp).map((row) => [
        row.eventId,
        probability,
      ]),
    );
    const rebuilt = buildGameValueData(loaded.sources, [], probabilities);
    const before = structuredClone({ rebuilt, proof });
    const corrected = withRetrospectivePenaltyContexts(rebuilt, proof);
    assert.deepEqual({ rebuilt, proof }, before);
    assert.deepEqual(corrected.penalties, loaded.game.penalties);
    const { penalties: _after, ...afterFacts } = corrected;
    const { penalties: _before, ...beforeFacts } = rebuilt;
    assert.deepEqual(afterFacts, beforeFacts);
    const rates = {
      "5v5:GG": 2.5,
      "5v4:GG": 7.5,
      "4v5:GG": 0.5,
      "5v3:GG": 12,
      "3v5:GG": 0.1,
      "4v4:GG": 2,
      "4v3:GG": 6,
      "3v4:GG": 0.2,
      "3v3:GG": 3,
    };
    assert.equal(valuePenaltyEvents(rebuilt, rates).entries.length, 0);
    const priced = valuePenaltyEvents(corrected, rates);
    assert.ok(priced.entries.some((entry) => Math.abs(entry.value) > 0));
    corrected.penalties[0]!.homeBefore = null;
    assert.deepEqual(proof, before.proof);
  }
});

test("retrospective ledger rejects mismatched identities, preimages, digests and illegal fact changes", async () => {
  const { sources, loaded } = await reviewed;
  const game = buildGameValueData(sources, []),
    original = loaded.sources.penaltyContextRecovery!;
  for (const mutate of [
    (p: typeof original) => {
      p.gameId++;
    },
    (p: typeof original) => {
      p.homeTeam++;
    },
    (p: typeof original) => {
      p.awayTeam++;
    },
    (p: typeof original) => {
      p.beforePenalties.reverse();
    },
    (p: typeof original) => {
      p.beforePenaltiesSha256 = "0".repeat(64);
    },
    (p: typeof original) => {
      p.afterPenaltiesSha256 = "0".repeat(64);
    },
    (p: typeof original) => {
      p.afterPenalties[0]!.second++;
      p.afterPenaltiesSha256 = digest(p.afterPenalties);
    },
    (p: typeof original) => {
      p.afterPenalties[0]!.homeBefore = 6;
      p.afterPenaltiesSha256 = digest(p.afterPenalties);
    },
    (p: typeof original) => {
      p.afterPenalties[0]!.awayBefore = null;
      p.afterPenaltiesSha256 = digest(p.afterPenalties);
    },
  ]) {
    const p = structuredClone(original);
    mutate(p);
    assert.throws(() => withRetrospectivePenaltyContexts(game, p));
  }
  const known = structuredClone(game),
    p = structuredClone(original);
  known.penalties[0]!.homeBefore = 5;
  known.penalties[0]!.awayBefore = 5;
  p.beforePenalties = structuredClone(known.penalties);
  p.beforePenaltiesSha256 = digest(p.beforePenalties);
  p.afterPenalties[0]!.homeBefore = 4;
  p.afterPenaltiesSha256 = digest(p.afterPenalties);
  assert.throws(
    () => withRetrospectivePenaltyContexts(known, p),
    /outside missing/,
  );
  assert.throws(
    () => withRetrospectivePenaltyContexts(game, undefined),
    /missing its verified/,
  );
  const other = { ...game, gameId: 2009020009 };
  assert.equal(withRetrospectivePenaltyContexts(other, undefined), other);
  assert.throws(() => withRetrospectivePenaltyContexts(other, original));
});

import assert from "node:assert/strict";
import test from "node:test";
import { HockeyDataCache } from "./game-value-source";
import {
  applyCachedHistoricalShotBridge,
  loadHistoricalShotSupplementalSources,
} from "./historical-shot-source";
import { createHash } from "node:crypto";

test("unselected historical bridge does not fetch an archive or change the source", async () => {
  class Cache extends HockeyDataCache {
    override async derived<T>(_key: string): Promise<T | undefined> {
      return undefined;
    }
    override async bytes(): Promise<Buffer> {
      throw Error("Unexpected source request");
    }
  }
  const raw = { id: 2008020001, plays: [] };
  assert.equal(
    await applyCachedHistoricalShotBridge(
      new Cache("unused", true),
      raw.id,
      raw,
      "a".repeat(64),
    ),
    raw,
  );
});

test("supplemental source IO is absent for every unselected game", async () => {
  class Cache extends HockeyDataCache {
    override async bytes(): Promise<Buffer> {
      throw Error("Unexpected source request");
    }
  }
  assert.equal(
    await loadHistoricalShotSupplementalSources(
      new Cache("unused", true),
      2009020714,
      {},
      "",
    ),
    undefined,
  );
});

test("supplemental GS IO binds actual body hashes and refuses a modified caller feed", async () => {
  const raw = { id: 2008020868, plays: [] };
  const summary = "retained official GS bytes";
  class Cache extends HockeyDataCache {
    override async bytes(url: string): Promise<Buffer> {
      if (url.endsWith("/play-by-play"))
        return Buffer.from(JSON.stringify(raw));
      if (url.endsWith("GS020868.HTM")) return Buffer.from(summary);
      throw Error("Unexpected source request");
    }
  }
  const cache = new Cache("unused", true);
  const result = await loadHistoricalShotSupplementalSources(
    cache,
    raw.id,
    raw,
    "PL bytes",
  );
  assert.equal(result?.sources.supplementalPenalty?.summaryHtml, summary);
  assert.equal(
    result?.sourceBodies.at(-1)?.sha256,
    createHash("sha256").update(summary).digest("hex"),
  );
  await assert.rejects(
    loadHistoricalShotSupplementalSources(
      cache,
      raw.id,
      { ...raw, plays: [{}] },
      "PL bytes",
    ),
    /differs from retained native source/,
  );
});

test("paired supplemental IO replays complete raw summaries instead of trusting a derived box", async () => {
  const gameId = 2008020935,
    raw = { id: gameId, plays: [] };
  const rows = [
    {
      gameId,
      playerId: 1,
      gamesPlayed: 1,
      homeRoad: "H",
      positionCode: "C",
      skaterFullName: "A",
      timeOnIcePerGame: 60,
    },
  ];
  const projected = {
    id: gameId,
    gameDate: "2009-03-01",
    playerByGameStats: {
      homeTeam: {
        forwards: [
          {
            playerId: 1,
            name: { default: "A" },
            position: "C",
            toi: "1:00",
            shotsAgainst: 0,
            goalsAgainst: 0,
          },
        ],
        defense: [],
        goalies: [],
      },
      awayTeam: { forwards: [], defense: [], goalies: [] },
    },
  };
  class Cache extends HockeyDataCache {
    changed = false;
    override async bytes(url: string): Promise<Buffer> {
      const parsed = new URL(url);
      if (url.endsWith("/play-by-play"))
        return Buffer.from(JSON.stringify(raw));
      if (url.endsWith("/boxscore")) return Buffer.from("{}");
      if (parsed.pathname.endsWith("/penaltyShots"))
        return Buffer.from(JSON.stringify({ total: 0, data: [] }));
      if (parsed.pathname.endsWith("/game"))
        return Buffer.from(
          JSON.stringify({
            total: 1,
            data: [
              {
                id: gameId,
                season: 20082009,
                gameType: 2,
                gameStateId: 7,
                gameDate: "2009-03-01",
              },
            ],
          }),
        );
      if (parsed.pathname.endsWith("/summary"))
        return Buffer.from(
          JSON.stringify({
            total: parsed.pathname.includes("/skater/") ? 1 : 0,
            data: parsed.pathname.includes("/skater/") ? rows : [],
          }),
        );
      throw Error("Unexpected source request");
    }
    override async derived<T>(): Promise<T | undefined> {
      return (
        this.changed ? { ...projected, gameDate: "2009-03-02" } : projected
      ) as T;
    }
  }
  const cache = new Cache("unused", true);
  const result = await loadHistoricalShotSupplementalSources(
    cache,
    gameId,
    raw,
    "PL",
  );
  assert.equal(
    result?.sources.pairedPenaltyShot?.officialAppearanceBoxText,
    JSON.stringify(projected),
  );
  assert.equal(
    result?.sourceBodies.filter((s) => s.url.includes("/summary?")).length,
    2,
  );
  cache.changed = true;
  await assert.rejects(
    loadHistoricalShotSupplementalSources(cache, gameId, raw, "PL"),
    /projection differs/,
  );
  rows[0]!.gamesPlayed = 0;
  await assert.rejects(
    loadHistoricalShotSupplementalSources(cache, gameId, raw, "PL"),
    /Invalid or truncated/,
  );
});
test("cached historical bridge rejects changed official source identity before loading any archive", async () => {
  class Cache extends HockeyDataCache {
    override async derived<T>(_key: string): Promise<T | undefined> {
      return {
        version: "nhl-historical-shot-source-proof-v1",
        audit: {
          gameId: 2008020001,
          provenance: { officialPbpSha256: "a".repeat(64) },
        },
      } as T;
    }
    override async bytes(): Promise<Buffer> {
      throw Error("Unexpected source request");
    }
  }
  await assert.rejects(
    applyCachedHistoricalShotBridge(
      new Cache("unused", true),
      2008020001,
      { id: 2008020001, plays: [] },
      "b".repeat(64),
    ),
    /proof scope\/source changed/,
  );
});

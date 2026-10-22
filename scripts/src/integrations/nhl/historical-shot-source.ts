import { createHash } from "node:crypto";
import type { HockeyDataCache } from "./game-value-source";
import {
  bridgeHistoricalShotSource,
  parseHistoricalRawShots,
  type HistoricalShotSupplementalSources,
} from "../../domains/nhl/historical-shot-source-bridge";
const hash = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");

/** Only the five reviewed source classes acquire supplemental public bodies.
 * The getter passes an offline retained view; no derived appearance projection
 * is trusted without reproducing it from both complete official report bodies. */
export async function loadHistoricalShotSupplementalSources(
  cache: HockeyDataCache,
  gameId: number,
  raw: unknown,
  primaryHtml: string,
) {
  if (
    ![2008020727, 2008020935, 2008021166, 2008020868, 2008021114].includes(
      gameId,
    )
  )
    return undefined;
  const urls: string[] = [];
  const sourceBodies: Array<{ url: string; sha256: string }> = [];
  const text = async (url: string) => {
    const body = await cache.bytes(url);
    urls.push(url);
    sourceBodies.push({ url, sha256: hash(body) });
    return body.toString("utf8");
  };
  const rawPbpText = await text(
    `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
  );
  if (JSON.stringify(JSON.parse(rawPbpText)) !== JSON.stringify(raw))
    throw Error(
      "Supplemental bridge input differs from retained native source",
    );
  const sources: HistoricalShotSupplementalSources = {};
  if (gameId === 2008020868) {
    sources.supplementalPenalty = {
      rawPbpText,
      primaryHtml,
      summaryHtml: await text(
        "https://www.nhl.com/scores/htmlreports/20082009/GS020868.HTM",
      ),
    };
  } else {
    const { fetchSeasonPenaltyShotGames } = await import("./game-value-source");
    const ledger = await fetchSeasonPenaltyShotGames(cache, 20082009, 2);
    // Re-read actual ledger bodies as well as validating parsed pagination.
    for (const url of ledger.urls) await text(url);
    const totals = ledger.rows.filter((p) => p.gameId === gameId);
    if (gameId === 2008021114) {
      sources.reportOnlyPenaltyShotAward = { rawPbpText, primaryHtml, totals };
    } else {
      const freshBoxText = await text(
        `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`,
      );
      const { fetchSeasonGames } = await import("./game-value-source");
      const scheduleUrl =
        "https://api.nhle.com/stats/rest/en/game?cayenneExp=season=20082009%20and%20gameType=2&limit=2000";
      const games = (await fetchSeasonGames(cache, 20082009, 2)).sort(
        (a, b) => a.id - b.id,
      );
      await text(scheduleUrl);
      const index = games.findIndex((g) => g.id === gameId);
      if (index < 0)
        throw Error(
          "Supplemental appearance game absent from official schedule",
        );
      const batch = games.slice(
        Math.floor(index / 100) * 100,
        Math.floor(index / 100) * 100 + 100,
      );
      const ids = new Set(batch.map((g) => g.id));
      const game = games[index]!;
      const team = () => ({
        forwards: [] as unknown[],
        defense: [] as unknown[],
        goalies: [] as unknown[],
      });
      const homeTeam = team(),
        awayTeam = team();
      const seen = new Set<number>();
      for (const kind of ["skater", "goalie"]) {
        const params = new URLSearchParams({
          isAggregate: "false",
          isGame: "true",
          start: "0",
          limit: "-1",
          cayenneExp: `gameId>=${batch[0]!.id} and gameId<=${batch.at(-1)!.id}`,
        });
        const url = `https://api.nhle.com/stats/rest/en/${kind}/summary?${params}`;
        const page = JSON.parse(await text(url)) as {
          total: number;
          data: Array<Record<string, unknown>>;
        };
        if (
          !Array.isArray(page.data) ||
          !Number.isInteger(page.total) ||
          page.total < 0 ||
          page.total >= 10000 ||
          page.data.length !== page.total ||
          page.data.some(
            (p) => !ids.has(Number(p.gameId)) || p.gamesPlayed !== 1,
          )
        )
          throw Error("Invalid or truncated supplemental appearance report");
        for (const p of page.data.filter((p) => p.gameId === gameId)) {
          const playerId = Number(p.playerId);
          const seconds = Number(
            kind === "goalie" ? p.timeOnIce : p.timeOnIcePerGame,
          );
          if (
            !Number.isInteger(playerId) ||
            playerId <= 0 ||
            seen.has(playerId) ||
            !["H", "R"].includes(String(p.homeRoad)) ||
            !Number.isInteger(seconds) ||
            seconds < 0
          )
            throw Error("Invalid supplemental appearance identity/TOI");
          seen.add(playerId);
          const target = p.homeRoad === "H" ? homeTeam : awayTeam;
          const row = {
            playerId: p.playerId,
            name: { default: p.skaterFullName ?? p.goalieFullName },
            position: kind === "goalie" ? "G" : p.positionCode,
            toi: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
            shotsAgainst: p.shotsAgainst ?? 0,
            goalsAgainst: p.goalsAgainst ?? 0,
          };
          (kind === "goalie"
            ? target.goalies
            : p.positionCode === "D"
              ? target.defense
              : target.forwards
          ).push(row);
        }
      }
      const projected = {
        id: gameId,
        gameDate: game.gameDate,
        playerByGameStats: { homeTeam, awayTeam },
      };
      const stored = await cache.derived(`box-${gameId}`);
      if (!stored || JSON.stringify(projected) !== JSON.stringify(stored))
        throw Error(
          "Canonical supplemental appearance projection differs from retained official reports",
        );
      sources.pairedPenaltyShot = {
        rawPbpText,
        primaryHtml,
        freshBoxText,
        officialAppearanceBoxText: JSON.stringify(projected),
        totals,
      };
    }
  }
  return { sources, urls: [...new Set(urls)], sourceBodies };
}
type Archive = {
  url: string;
  sha256: string;
  parsed: ReturnType<typeof parseHistoricalRawShots>;
};
const archives = new WeakMap<HockeyDataCache, Map<number, Promise<Archive>>>();
async function archive(cache: HockeyDataCache, year: number) {
  let map = archives.get(cache);
  if (!map) {
    map = new Map();
    archives.set(cache, map);
  }
  const prior = map.get(year);
  if (prior) return prior;
  const promise = (async () => {
    const url = `https://peter-tanner.com/moneypuck/downloads/shots_${year}.zip`,
      bytes = await cache.bytes(url);
    const { unzipCsv } = await import("./game-value-source");
    return {
      url,
      sha256: hash(bytes),
      parsed: parseHistoricalRawShots(
        unzipCsv(bytes, `shots_${year}.csv`),
        year * 10001 + 1,
      ),
    };
  })();
  map.set(year, promise);
  // Normal collection/preparation is one season per process; retain at most two
  // decoded archives if an operator explicitly inspects several seasons.
  if (map.size > 2) map.delete(map.keys().next().value!);
  return promise;
}
async function reconstruct(
  cache: HockeyDataCache,
  gameId: number,
  raw: unknown,
  rawSha: string,
) {
  const year = Math.floor(gameId / 1e6),
    data = await archive(cache, year);
  const reportUrl = `https://www.nhl.com/scores/htmlreports/${year * 10001 + 1}/PL${String(gameId % 1e6).padStart(6, "0")}.HTM`,
    html = await cache.bytes(reportUrl);
  const boxUrl =
      gameId === 2009020714
        ? `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`
        : undefined,
    boxBytes = boxUrl ? await cache.bytes(boxUrl) : undefined;
  const provenance = {
    providerUrl: data.url,
    providerSha256: data.sha256,
    officialPlayReportUrl: reportUrl,
    officialPlayReportSha256: hash(html),
    officialPbpSha256: rawSha,
  };
  const supplemental = await loadHistoricalShotSupplementalSources(
    cache,
    gameId,
    raw,
    html.toString("utf8"),
  );
  const result = boxBytes
    ? (
        await import("../../domains/nhl/missing-native-shot-source")
      ).bridgeMissingNativeShotSource(
        raw,
        data.parsed.games.get(gameId) ?? [],
        html.toString("utf8"),
        JSON.parse(boxBytes.toString("utf8")),
        provenance,
        { url: boxUrl!, sha256: hash(boxBytes) },
      )
    : bridgeHistoricalShotSource(
        raw,
        data.parsed.games.get(gameId) ?? [],
        html.toString("utf8"),
        {
          providerUrl: data.url,
          providerSha256: data.sha256,
          officialPlayReportUrl: reportUrl,
          officialPlayReportSha256: hash(html),
          officialPbpSha256: rawSha,
        },
        supplemental?.sources,
      );
  return {
    ...result,
    audit: {
      ...result.audit,
      archiveRejections: data.parsed.rejected.filter(
        (r) => r.gameId === gameId,
      ),
      ...(supplemental
        ? { supplementalSourceBodies: supplemental.sourceBodies }
        : {}),
    },
    urls: [
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
      data.url,
      reportUrl,
      ...(boxUrl ? [boxUrl] : []),
      ...(supplemental?.urls ?? []),
    ],
  };
}
type Proof = {
  version: "nhl-historical-shot-source-proof-v1";
  outputSha256: string;
  audit: Awaited<ReturnType<typeof reconstruct>>["audit"];
};

/** Explicit operator opt-in only. Original URL cache entries are never changed. */
export async function collectHistoricalShotBridge(
  cache: HockeyDataCache,
  gameId: number,
) {
  const availability = await import(
    "./reviewed-event-source-availability-source"
  );
  if (availability.isReviewedEventSourceAvailabilityGame(gameId)) {
    const proof = await availability.collectReviewedEventSourceAvailability(
      cache,
      gameId,
    );
    if (availability.isWhollyUnavailableReviewedEventGame(gameId))
      return {
        gameId,
        eventSourceAvailability: proof,
        interpretation:
          "No historical event bridge attempted: retained official play report is empty; native exposure is unchanged and event value is unavailable.",
      };
  }
  const { fetchGamePlayByPlay } = await import("./game-value-source");
  const previous = await cache.derived<Proof>(
    `historical-shot-bridge-${gameId}`,
  );
  const prebridge = await import("./reviewed-2008-shot-credit-source");
  if (prebridge.isReviewed2008ShotCreditGame(gameId)) {
    // Acquire explicitly, then prove BOTH stages before installing either.
    for (const url of prebridge.reviewed2008ShotCreditUrls(gameId))
      await cache.bytes(url);
    const candidate = await prebridge.replayReviewed2008ShotCredits(
      cache,
      gameId,
    );
    const result = await reconstruct(
      cache.retainedView(),
      gameId,
      candidate.pbp,
      candidate.proof.rawPbpSha256,
    );
    const bridge: Proof = {
      version: "nhl-historical-shot-source-proof-v1",
      outputSha256: hash(JSON.stringify(result.pbp)),
      audit: result.audit,
    };
    if (previous && JSON.stringify(previous) !== JSON.stringify(bridge))
      throw Error("Existing paired historical bridge changed");
    // Interrupted bridge-only installation fails replay on the uncorrected feed.
    await cache.saveDerived(
      `historical-shot-bridge-${gameId}`,
      bridge,
      result.urls,
    );
    await cache.saveDerived(
      prebridge.reviewed2008ShotCreditKey(gameId),
      candidate.proof,
      candidate.urls,
    );
    if (
      JSON.stringify(
        await cache.derived(prebridge.reviewed2008ShotCreditKey(gameId)),
      ) !== JSON.stringify(candidate.proof) ||
      hash(
        JSON.stringify(await fetchGamePlayByPlay(cache.retainedView(), gameId)),
      ) !== bridge.outputSha256
    )
      throw Error("Paired prebridge proof readback differs");
    return bridge.audit;
  }
  if (previous) {
    await fetchGamePlayByPlay(cache, gameId);
    return previous.audit;
  }
  const raw = await fetchGamePlayByPlay(cache, gameId),
    bytes = await cache.bytes(
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
    );
  const result = await reconstruct(cache, gameId, raw, hash(bytes));
  const proof: Proof = {
    version: "nhl-historical-shot-source-proof-v1",
    outputSha256: hash(JSON.stringify(result.pbp)),
    audit: result.audit,
  };
  await cache.saveDerived(
    `historical-shot-bridge-${gameId}`,
    proof,
    result.urls,
  );
  return result.audit;
}

/** Every consuming stage independently replays the raw-field joins. The cache
 * envelope binds source metadata; reading the actual bodies rechecks their hashes.
 * A proof generated by another implementation cannot silently change output. */
export async function applyCachedHistoricalShotBridge<T>(
  cache: HockeyDataCache,
  gameId: number,
  raw: T,
  rawPbpSha256: string,
): Promise<T> {
  const proof = await cache.derived<Proof>(`historical-shot-bridge-${gameId}`);
  if (!proof) return raw;
  if (
    proof.version !== "nhl-historical-shot-source-proof-v1" ||
    proof.audit.gameId !== gameId ||
    proof.audit.provenance.officialPbpSha256 !== rawPbpSha256
  )
    throw Error("Historical shot bridge proof scope/source changed");
  const result = await reconstruct(
    cache.retainedView(),
    gameId,
    raw,
    rawPbpSha256,
  );
  if (
    hash(JSON.stringify(result.pbp)) !== proof.outputSha256 ||
    JSON.stringify(result.audit) !== JSON.stringify(proof.audit)
  )
    throw Error("Historical shot bridge replay changed");
  // Output keeps the caller's official top-level fields and enriches only plays.
  return result.pbp as T;
}

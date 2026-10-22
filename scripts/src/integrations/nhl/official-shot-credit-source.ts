import { createHash } from "node:crypto";
import type { HockeyDataCache } from "./game-value-source";
import {
  reconcileOfficialShotCredits,
  REVIEWED_SHOT_CREDIT_CASES,
  type OfficialShotCreditSources,
} from "../../domains/nhl/official-shot-credit-reconciliation";
import { parseHistoricalRawShots } from "../../domains/nhl/historical-shot-source-bridge";

type Proof = ReturnType<typeof reconcileOfficialShotCredits>["proof"];
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const archives = new WeakMap<
  HockeyDataCache,
  Promise<{
    url: string;
    sha256: string;
    parsed: ReturnType<typeof parseHistoricalRawShots>;
  }>
>();

export async function loadRetained2009PrimarySources(
  cache: HockeyDataCache,
  gameId: number,
  effectivePbp: unknown,
): Promise<OfficialShotCreditSources> {
  if (
    !Number.isSafeInteger(gameId) ||
    gameId < 2009020001 ||
    gameId > 2009021230
  )
    throw Error("Retained primary source is outside the 2009 regular season");
  let archive = archives.get(cache);
  if (!archive) {
    archive = (async () => {
      const url = "https://peter-tanner.com/moneypuck/downloads/shots_2009.zip";
      const bytes = await cache.retainedBytes(url);
      const { unzipCsv } = await import("./game-value-source");
      return {
        url,
        sha256: hash(bytes),
        parsed: parseHistoricalRawShots(
          unzipCsv(bytes, "shots_2009.csv"),
          20092010,
        ),
      };
    })();
    archives.set(cache, archive);
  }
  const suffix = String(gameId % 1e6).padStart(6, "0");
  const urls = {
    rawPbp: `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
    playReport: `https://www.nhl.com/scores/htmlreports/20092010/PL${suffix}.HTM`,
    gameSummary: `https://www.nhl.com/scores/htmlreports/20092010/GS${suffix}.HTM`,
    boxscore: `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`,
  };
  const [provider, raw, report, summary, box] = await Promise.all([
    archive,
    cache.retainedBytes(urls.rawPbp),
    cache.retainedBytes(urls.playReport),
    cache.retainedBytes(urls.gameSummary),
    cache.retainedBytes(urls.boxscore),
  ]);
  return {
    rawPbpText: raw.toString("utf8"),
    effectivePbp,
    playReportHtml: report.toString("utf8"),
    gameSummaryHtml: summary.toString("utf8"),
    boxscoreText: box.toString("utf8"),
    providerRows: provider.parsed.games.get(gameId) ?? [],
    providerArchive: { url: provider.url, sha256: provider.sha256 },
  };
}

async function replay(
  cache: HockeyDataCache,
  gameId: number,
  effectivePbp: unknown,
) {
  if (!REVIEWED_SHOT_CREDIT_CASES.some(([id]) => id === gameId))
    throw Error("Shot-credit source is outside the reviewed game scope");
  return reconcileOfficialShotCredits(
    await loadRetained2009PrimarySources(cache, gameId, effectivePbp),
  );
}

/** Reparse retained primary sources before applying an explicit source proof. */
export async function applyCachedOfficialShotCredits<T>(
  cache: HockeyDataCache,
  gameId: number,
  effectivePbp: T,
  originalRawSha256: string,
): Promise<T> {
  const proof = await cache.derived<Proof>(`official-shot-credit-${gameId}`);
  if (!proof) return effectivePbp;
  if (
    proof.originalRawPbpSha256 !== originalRawSha256 ||
    proof.preOverlayEffectivePbpSha256 !== hash(JSON.stringify(effectivePbp))
  )
    throw Error("Reviewed shot-credit source input changed");
  const result = await replay(cache, gameId, effectivePbp);
  if (
    proof.originalRawPbpSha256 !== originalRawSha256 ||
    JSON.stringify(result.proof) !== JSON.stringify(proof)
  )
    throw Error("Reviewed shot-credit source proof changed");
  return result.pbp as T;
}

/** Local, additive operator step. Acquisition and review precede this call. */
export async function collectOfficialShotCredits(
  cache: HockeyDataCache,
  gameId: number,
) {
  if (!REVIEWED_SHOT_CREDIT_CASES.some(([id]) => id === gameId))
    throw Error("Shot-credit collection is outside the reviewed game scope");
  const { fetchGamePlayByPlay } = await import("./game-value-source");
  const retained = cache.retainedView();
  const key = `official-shot-credit-${gameId}`;
  const previous = await cache.derived<Proof>(key);
  if (previous) {
    await fetchGamePlayByPlay(retained, gameId);
    return previous;
  }
  const effective = await fetchGamePlayByPlay(retained, gameId);
  const result = await replay(retained, gameId, effective);
  await cache.saveDerived(key, result.proof, [
    ...Object.values(result.proof.sourceUrls),
    result.proof.providerArchive.url,
  ]);
  if (
    JSON.stringify(await cache.derived<Proof>(key)) !==
      JSON.stringify(result.proof) ||
    hash(JSON.stringify(await fetchGamePlayByPlay(retained, gameId))) !==
      result.proof.outputSha256
  )
    throw Error("Reviewed shot-credit source readback differs");
  return result.proof;
}

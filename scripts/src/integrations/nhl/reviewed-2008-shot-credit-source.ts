import { createHash } from "node:crypto";
import type { HockeyDataCache } from "./game-value-source";
import {
  repairReviewed2008ShotCredits,
  REVIEWED_2008_SHOT_CREDIT_CASES,
} from "../../domains/nhl/reviewed-2008-shot-credit";
import { parseHistoricalRawShots } from "../../domains/nhl/historical-shot-source-bridge";

type Proof = ReturnType<typeof repairReviewed2008ShotCredits>["proof"];
const hash = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
export const reviewed2008ShotCreditKey = (id: number) =>
  `reviewed-2008-prebridge-credit-${id}`;
export const isReviewed2008ShotCreditGame = (id: number) =>
  REVIEWED_2008_SHOT_CREDIT_CASES.some(([game]) => game === id);
const archives = new WeakMap<
  HockeyDataCache,
  Promise<{
    url: string;
    sha256: string;
    parsed: ReturnType<typeof parseHistoricalRawShots>;
  }>
>();
export function reviewed2008ShotCreditUrls(id: number) {
  if (!isReviewed2008ShotCreditGame(id))
    throw Error("Prebridge credit outside reviewed scope");
  const suffix = String(id % 1e6).padStart(6, "0");
  return [
    `https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`,
    `https://www.nhl.com/scores/htmlreports/20082009/PL${suffix}.HTM`,
    `https://www.nhl.com/scores/htmlreports/20082009/GS${suffix}.HTM`,
    `https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`,
    "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip",
  ];
}
/** No acquisition or writes: rebuild the precursor from retained primary bodies. */
export async function replayReviewed2008ShotCredits(
  cache: HockeyDataCache,
  id: number,
) {
  const urls = reviewed2008ShotCreditUrls(id);
  let archive = archives.get(cache);
  if (!archive) {
    archive = (async () => {
      const bytes = await cache.retainedBytes(urls[4]!);
      const { unzipCsv } = await import("./game-value-source");
      return {
        url: urls[4]!,
        sha256: hash(bytes),
        parsed: parseHistoricalRawShots(
          unzipCsv(bytes, "shots_2008.csv"),
          20082009,
        ),
      };
    })();
    archives.set(cache, archive);
  }
  const [raw, pl, gs, box, provider] = await Promise.all([
    cache.retainedBytes(urls[0]!),
    cache.retainedBytes(urls[1]!),
    cache.retainedBytes(urls[2]!),
    cache.retainedBytes(urls[3]!),
    archive,
  ]);
  const result = repairReviewed2008ShotCredits({
    rawPbpText: raw.toString("utf8"),
    effectivePbp: JSON.parse(raw.toString("utf8")),
    playReportHtml: pl.toString("utf8"),
    gameSummaryHtml: gs.toString("utf8"),
    boxscoreText: box.toString("utf8"),
    providerRows: provider.parsed.games.get(id) ?? [],
    providerArchive: { url: provider.url, sha256: provider.sha256 },
  });
  if (result.proof.gameId !== id)
    throw Error("Prebridge source URL/game differs");
  return { ...result, urls };
}
/** A precursor alone never authorizes a corrected but unbridged source stream. */
export async function applyCachedReviewed2008ShotCredits<T>(
  cache: HockeyDataCache,
  id: number,
  raw: T,
  rawSha: string,
): Promise<T> {
  const proof = await cache.derived<Proof>(reviewed2008ShotCreditKey(id));
  if (!proof) return raw;
  if (
    proof.rawPbpSha256 !== rawSha ||
    proof.preOverlayPbpSha256 !== hash(JSON.stringify(raw))
  )
    throw Error("Prebridge original input changed");
  const bridge = await cache.derived<{
    version: string;
    outputSha256: string;
    audit: { gameId: number; provenance: { officialPbpSha256: string } };
  }>(`historical-shot-bridge-${id}`);
  if (
    !bridge ||
    bridge.version !== "nhl-historical-shot-source-proof-v1" ||
    bridge.audit.gameId !== id ||
    bridge.audit.provenance.officialPbpSha256 !== rawSha
  )
    throw Error("Prebridge correction requires its complete historical bridge");
  const result = await replayReviewed2008ShotCredits(cache.retainedView(), id);
  if (JSON.stringify(result.proof) !== JSON.stringify(proof))
    throw Error("Prebridge source proof changed");
  return result.pbp as T;
}

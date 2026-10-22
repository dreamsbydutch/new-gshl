import { createHash } from "node:crypto";
import type { HockeyDataCache } from "./game-value-source";
import {
  proveReviewedEventSourceAvailability,
  applyReviewedEventSourceAvailability,
  type ReviewedEventSourceAvailabilityProof,
} from "../../domains/nhl/reviewed-event-source-availability";

export const REVIEWED_EVENT_SOURCE_AVAILABILITY_GAME_IDS = [
  2008020076, 2008020259, 2008020409, 2008021077,
] as const;
export function isReviewedEventSourceAvailabilityGame(id: number) {
  return (
    REVIEWED_EVENT_SOURCE_AVAILABILITY_GAME_IDS as readonly number[]
  ).includes(id);
}
export function isWhollyUnavailableReviewedEventGame(id: number) {
  return id === 2008020259 || id === 2008020409 || id === 2008021077;
}
const hash = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
const key = (id: number) => `reviewed-event-source-availability-v1-${id}`;
function urls(id: number) {
  if (!isReviewedEventSourceAvailabilityGame(id))
    throw Error("Event-source availability is outside reviewed scope");
  const suffix = String(id % 1e6).padStart(6, "0");
  return {
    rawPbp: `https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`,
    playReport: `https://www.nhl.com/scores/htmlreports/20082009/PL${suffix}.HTM`,
    gameSummary: `https://www.nhl.com/scores/htmlreports/20082009/GS${suffix}.HTM`,
    providerArchive:
      "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip",
  };
}

/** Replays only retained bodies, even when the caller allows public acquisition. */
export async function replayReviewedEventSourceAvailability(
  cache: HockeyDataCache,
  id: number,
) {
  const sourceUrls = urls(id);
  cache = cache.retainedView();
  const raw = await cache.retainedBytes(sourceUrls.rawPbp),
    pl = await cache.retainedBytes(sourceUrls.playReport),
    gs = await cache.retainedBytes(sourceUrls.gameSummary),
    archive = await cache.retainedBytes(sourceUrls.providerArchive);
  const proof = proveReviewedEventSourceAvailability({
    rawPbpText: raw.toString("utf8"),
    playReportHtml: pl.toString("utf8"),
    gameSummaryHtml: gs.toString("utf8"),
    providerArchive: { url: sourceUrls.providerArchive, sha256: hash(archive) },
  });
  if (proof.gameId !== id)
    throw Error("Reviewed event-source URL/game identity differs");
  return { proof, urls: Object.values(sourceUrls) };
}

/** Missing proof preserves native input. Existing proof must bind the exact
 * original input and freshly replay every retained source before annotation. */
export async function applyCachedReviewedEventSourceAvailability<T>(
  cache: HockeyDataCache,
  id: number,
  raw: T,
  originalRawSha256: string,
): Promise<T> {
  const proof = await cache.derived<ReviewedEventSourceAvailabilityProof>(
    key(id),
  );
  if (!proof) return raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Invalid event-source native input");
  const base = { ...raw } as Record<string, unknown>;
  delete base.reviewedEventSourceAvailability;
  if (
    proof.gameId !== id ||
    proof.sourceHashes.rawPbpSha256 !== originalRawSha256 ||
    proof.inputPbpSha256 !== hash(JSON.stringify(base))
  )
    throw Error("Reviewed event-source original input changed");
  const replayed = await replayReviewedEventSourceAvailability(cache, id);
  if (JSON.stringify(replayed.proof) !== JSON.stringify(proof))
    throw Error("Reviewed event-source availability proof changed");
  return applyReviewedEventSourceAvailability(raw, replayed.proof);
}

/** Explicit historical-source collection is the only acquisition seam. Raw URL
 * bodies stay immutable; only a new reviewed metadata proof is installed. */
export async function collectReviewedEventSourceAvailability(
  cache: HockeyDataCache,
  id: number,
) {
  const sourceUrls = urls(id);
  // Acquisition precedes replay. No catch can turn failed/malformed evidence into an unknown source.
  for (const url of Object.values(sourceUrls)) await cache.bytes(url);
  const replayed = await replayReviewedEventSourceAvailability(cache, id);
  await cache.saveDerived(key(id), replayed.proof, replayed.urls);
  if (
    JSON.stringify(await cache.derived(key(id))) !==
    JSON.stringify(replayed.proof)
  )
    throw Error("Reviewed event-source proof readback differs");
  return replayed.proof;
}

import { createHash } from "node:crypto";
import type { HockeyDataCache } from "./game-value-source";
import {
  parseOfficialPenaltyShotContext,
  applyOfficialPenaltyShotContext,
  type OfficialPenaltyShotContextProof,
} from "../../domains/nhl/official-penalty-shot-context";
import type { PenaltyShotGameTotal } from "../../domains/nhl/official-penalty-shot-report";
import {
  penaltyShotGameMatches,
  parseOfficialPenaltyShots,
  OfficialPenaltyShotResolutionError,
} from "../../domains/nhl/official-penalty-shot-report";
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function verify(
  cache: HockeyDataCache,
  gameId: number,
  raw: unknown,
  totals: PenaltyShotGameTotal[],
  pbpHash: string,
) {
  const year = Math.floor(gameId / 1e6),
    reportUrl = `https://www.nhl.com/scores/htmlreports/${year * 10001 + 1}/PL${String(gameId % 1e6).padStart(6, "0")}.HTM`,
    boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
  const [html, box] = await Promise.all([
    cache.bytes(reportUrl),
    cache.bytes(boxUrl),
  ]);
  const proof = parseOfficialPenaltyShotContext(
    html.toString("utf8"),
    raw,
    JSON.parse(box.toString("utf8")),
    totals,
    {
      pbpSha256: pbpHash,
      htmlSha256: hash(html),
      boxSha256: hash(box),
      scopedPenaltyLedgerSha256: hash(JSON.stringify(totals)),
    },
  );
  return {
    proof,
    urls: [
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
      reportUrl,
      boxUrl,
    ],
  };
}
export async function collectOfficialPenaltyShotContext(
  cache: HockeyDataCache,
  gameId: number,
  totals: PenaltyShotGameTotal[],
  ledgerUrls: string[],
) {
  const { fetchGamePlayByPlay } = await import("./game-value-source");
  const raw = await fetchGamePlayByPlay(cache, gameId);
  if (penaltyShotGameMatches(raw, totals)) return null;
  const bytes = await cache.bytes(
    `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
  );
  const year = Math.floor(gameId / 1e6),
    reportUrl = `https://www.nhl.com/scores/htmlreports/${year * 10001 + 1}/PL${String(gameId % 1e6).padStart(6, "0")}.HTM`,
    html = await cache.bytes(reportUrl);
  let eventIds: number[];
  try {
    eventIds = parseOfficialPenaltyShots(html.toString("utf8"), raw, totals);
  } catch (error) {
    if (!(error instanceof OfficialPenaltyShotResolutionError)) throw error;
    // Scope/format/input failures never reach this stronger proof path. It
    // independently reloads and validates HTML, box, actors and ledger evidence.
    const result = await verify(cache, gameId, raw, totals, hash(bytes));
    await cache.saveDerived(
      `official-penalty-shot-context-${gameId}`,
      result.proof,
      [...result.urls, ...ledgerUrls],
    );
    return result.proof;
  }
  // Exactly the existing legacy supplement shape: no new events or proof class.
  await cache.saveDerived(`penalty-shots-${gameId}`, { gameId, eventIds }, [
    reportUrl,
    `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
    ...ledgerUrls,
  ]);
  return null;
}
export async function applyCachedPenaltyShotContext<T>(
  cache: HockeyDataCache,
  gameId: number,
  raw: T,
  rawPbpSha256: string,
): Promise<T> {
  const saved = await cache.derived<OfficialPenaltyShotContextProof>(
    `official-penalty-shot-context-${gameId}`,
  );
  if (!saved) return raw;
  const { fetchSeasonPenaltyShotGames } = await import("./game-value-source");
  const year = Math.floor(gameId / 1e6),
    ledger = await fetchSeasonPenaltyShotGames(cache, year * 10001 + 1, 2),
    totals = ledger.rows.filter((r) => r.gameId === gameId),
    verified = await verify(cache, gameId, raw, totals, rawPbpSha256);
  if (JSON.stringify(verified.proof) !== JSON.stringify(saved))
    throw Error("Official penalty-shot context proof replay changed");
  return applyOfficialPenaltyShotContext(raw, saved, rawPbpSha256);
}

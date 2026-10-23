import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  HockeyDataCache,
  fetchSeasonGames,
  fetchGamePlayByPlay,
} from "./game-value-source";
import { loadVerifiedGame } from "../../domains/nhl/verified-game-source";
import { extractShotTrainingRows } from "../../domains/nhl/game-value-input";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
} from "../../domains/nhl/season-rating-input";
import {
  withOfficialSkaterGoals,
  summarizeOfficialGoalCoverage,
} from "../../domains/nhl/official-goal-coverage";
import {
  withOfficialOnGoalAttempts,
  countObservedSkaterOnGoalAttempts,
  summarizeOfficialSourceCoverage,
  summarizeOfficialOnGoalCoverage,
} from "../../domains/nhl/official-on-goal-coverage";
import { reconcileSeasonExposure } from "../../domains/nhl/game-reconciliation";
import { withReviewedOnGoalClassifications } from "./official-on-goal-classification-source";
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
class ReadOnlyCache extends HockeyDataCache {
  override async saveDerived(
    _key: string,
    _data: unknown,
    _urls: string[],
  ): Promise<void> {
    throw new Error(
      "Physical goal audit cannot create or change source proofs",
    );
  }
}
export type OfficialGoalPhysicalAuditInput = {
  cacheDirectory: string;
  sourceText: string;
  season: number;
  gameType: 2;
  expectedCanonicalSourceSha256: string;
  gameSourceHashes: Array<{ gameId: number; sha256: string }>;
  expectedGameSourcesHash: string;
  penaltyShotProbability: number;
};
/** Fresh physical-source replay, independently of saved goal totals or fitted xG models. */
export async function verifyOfficialGoalCoverageFromCache(
  input: OfficialGoalPhysicalAuditInput,
) {
  if (
    !/^[a-f0-9]{64}$/.test(input.expectedCanonicalSourceSha256) ||
    hash(input.sourceText) !== input.expectedCanonicalSourceSha256 ||
    input.gameType !== 2 ||
    !Number.isFinite(input.penaltyShotProbability) ||
    input.penaltyShotProbability < 0 ||
    input.penaltyShotProbability > 1
  )
    throw new Error("Invalid canonical goal audit binding/scope");
  if (
    !input.gameSourceHashes.length ||
    new Set(input.gameSourceHashes.map((g) => g.gameId)).size !==
      input.gameSourceHashes.length ||
    input.gameSourceHashes.some(
      (g) => !Number.isInteger(g.gameId) || !/^[a-f0-9]{64}$/.test(g.sha256),
    ) ||
    hash(JSON.stringify(input.gameSourceHashes)) !==
      input.expectedGameSourcesHash
  )
    throw new Error("Invalid game source goal audit bindings");
  const source = JSON.parse(input.sourceText) as { nhl: NhlRatingSource };
  if (
    source.nhl.season !== input.season ||
    source.nhl.gameType !== input.gameType
  )
    throw new Error("Canonical goal audit season differs");
  const baseReference = withOfficialOnGoalAttempts(
    withOfficialSkaterGoals(
      buildNhlRatingInput(source.nhl).players.filter(
        (p) => p.games > 0 && p.minutes > 0,
      ),
      source.nhl,
    ),
    source.nhl,
  );
  const paths = [
    "scripts/src/domains/nhl/official-goal-coverage.ts",
    "scripts/src/domains/nhl/official-on-goal-coverage.ts",
    "scripts/src/domains/nhl/official-on-goal-classification.ts",
    "scripts/src/integrations/nhl/official-on-goal-classification-source.ts",
    "scripts/src/domains/nhl/official-shot-credit-reconciliation.ts",
    "scripts/src/integrations/nhl/official-shot-credit-source.ts",
    "scripts/src/domains/nhl/official-primary-event-recovery.ts",
    "scripts/src/integrations/nhl/official-primary-event-source.ts",
    "scripts/src/domains/nhl/reviewed-event-source-availability.ts",
    "scripts/src/integrations/nhl/reviewed-event-source-availability-source.ts",
    "scripts/src/domains/nhl/reviewed-2008-shot-credit.ts",
    "scripts/src/integrations/nhl/reviewed-2008-shot-credit-source.ts",
    "scripts/src/integrations/nhl/official-goal-physical-audit.ts",
    "scripts/src/domains/nhl/game-value-input.ts",
    "scripts/src/domains/nhl/verified-game-source.ts",
    "scripts/src/domains/nhl/official-penalty-context.ts",
    "scripts/src/integrations/nhl/official-penalty-context-source.ts",
    "scripts/src/integrations/nhl/game-value-source.ts",
    "scripts/src/domains/nhl/official-shift-report.ts",
    "scripts/src/domains/nhl/official-game-clock.ts",
    "scripts/src/domains/nhl/unavailable-shift-proof.ts",
    "scripts/src/integrations/nhl/unavailable-shift-source.ts",
    "scripts/src/domains/nhl/boundary-shift-reconciliation.ts",
    "scripts/src/domains/nhl/boundary-shift-2008-cases.ts",
    "scripts/src/integrations/nhl/boundary-shift-source.ts",
    "scripts/src/domains/nhl/official-penalty-shot-report.ts",
    "scripts/src/domains/nhl/official-penalty-shot-context.ts",
    "scripts/src/domains/nhl/official-missing-penalty-shot.ts",
    "scripts/src/integrations/nhl/official-penalty-shot-context-source.ts",
    "scripts/src/domains/nhl/historical-shot-source-bridge.ts",
    "scripts/src/domains/nhl/historical-shot-type-alignment.ts",
    "scripts/src/domains/nhl/reviewed-paired-penalty-shot-source.ts",
    "scripts/src/domains/nhl/reviewed-gs-penalty-source.ts",
    "scripts/src/domains/nhl/reviewed-report-only-penalty-shot-award.ts",
    "scripts/src/domains/nhl/historical-penalty-alignment.ts",
    "scripts/src/domains/nhl/missing-native-shot-source.ts",
    "scripts/src/integrations/nhl/historical-shot-source.ts",
  ];
  const codeHashes = await Promise.all(
    paths.map(async (path) => ({ path, sha256: hash(await readFile(path)) })),
  );
  const cacheDirectory = resolve(input.cacheDirectory),
    cache = new ReadOnlyCache(cacheDirectory, true),
    schedule = await fetchSeasonGames(cache, input.season, input.gameType);
  const reference = await withReviewedOnGoalClassifications(
    cache,
    input.season,
    baseReference,
  );
  if (
    !schedule.length ||
    schedule.length !== input.gameSourceHashes.length ||
    schedule.some((g) => !input.gameSourceHashes.some((s) => s.gameId === g.id))
  )
    throw new Error("Goal audit completed-game population differs");
  const expected = new Map(
      input.gameSourceHashes.map((g) => [g.gameId, g.sha256]),
    ),
    games = [];
  let observedSkaterOnGoalAttempts = 0;
  for (const entry of schedule) {
    const pbp = await fetchGamePlayByPlay(cache, entry.id),
      rows = extractShotTrainingRows(pbp);
    const loaded = await loadVerifiedGame(
      cache,
      entry.id,
      [],
      new Map(rows.map((r) => [r.eventId, 0])),
      input.penaltyShotProbability,
    );
    if (
      hash(JSON.stringify(loaded.sources)) !== expected.get(entry.id) ||
      loaded.game.gameId !== entry.id ||
      loaded.game.date !== entry.gameDate ||
      loaded.game.homeTeam !== entry.homeTeamId ||
      loaded.game.awayTeam !== entry.visitingTeamId
    )
      throw new Error(`Physical goal source changed for ${entry.id}`);
    observedSkaterOnGoalAttempts += countObservedSkaterOnGoalAttempts(pbp);
    games.push({
      gameId: loaded.game.gameId,
      gameSeconds: loaded.game.gameSeconds,
      usableProcessSeconds: loaded.game.usableProcessSeconds,
      officialShots: loaded.game.officialShots,
      players: loaded.game.players,
      shots: loaded.game.shots.map((shot) => ({
        eventId: shot.eventId,
        shooter: shot.shooter,
        goalie: shot.goalie,
        kind: shot.kind,
        period: shot.period,
        second: shot.second,
      })),
      shotCoverageByPlayer: loaded.game.shotCoverageByPlayer,
    });
  }
  const exposure = reconcileSeasonExposure(games, reference);
  if (!exposure.matches)
    throw new Error("Official goal audit exposure/population differs");
  const goalCoverage = summarizeOfficialGoalCoverage(games, reference);
  const onGoalCoverage = summarizeOfficialOnGoalCoverage(games, reference);
  const sourceCoverage = summarizeOfficialSourceCoverage(
    games,
    reference,
    source.nhl,
    observedSkaterOnGoalAttempts,
    {
      officialGames: schedule.length,
      officialSeasonExposureMatches: exposure.matches,
    },
  );
  for (const file of codeHashes)
    if (hash(await readFile(file.path)) !== file.sha256)
      throw new Error("Physical goal audit code changed during replay");
  return {
    version: "nhl-official-goal-physical-audit-v1" as const,
    passed: true as const,
    season: input.season,
    gameType: input.gameType,
    sourceCacheDirectory: cacheDirectory,
    canonicalSourceSha256: input.expectedCanonicalSourceSha256,
    gameSourcesHash: input.expectedGameSourcesHash,
    gameSourceHashes: input.gameSourceHashes.map((g) => ({ ...g })),
    codeHashes,
    exposure,
    goalCoverage,
    onGoalCoverage,
    sourceCoverage,
    interpretation:
      "Fresh offline source reconstruction, verified individual GOAL counts, and canonical skater SOG/goalie SA denominators. Ordinary probability0 is presence-only; no xG inference or player valuation. Missing on-goal events expand coverage denominators without inventing events; official goal deficits remain unqualified.",
  };
}

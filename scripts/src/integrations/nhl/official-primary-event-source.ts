import { createHash } from "node:crypto";
import type { HockeyDataCache } from "./game-value-source";
import {
  recoverOfficialPrimaryEvents,
  REVIEWED_PRIMARY_RECOVERY_GAME_IDS,
} from "../../domains/nhl/official-primary-event-recovery";
import type { OfficialOnGoalClassificationProof } from "../../domains/nhl/official-on-goal-classification";
import { loadRetained2009PrimarySources } from "./official-shot-credit-source";
import { replayOfficialOnGoalClassification } from "./official-on-goal-classification-source";

type Recovery = ReturnType<typeof recoverOfficialPrimaryEvents>;
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const key = (gameId: number) => `official-primary-events-${gameId}`;
const classificationKey = (gameId: number) =>
  `official-on-goal-classification-${gameId}`;

async function recover(cache: HockeyDataCache, gameId: number, input: unknown) {
  if (
    !(REVIEWED_PRIMARY_RECOVERY_GAME_IDS as readonly number[]).includes(gameId)
  )
    throw Error("Primary-event recovery is outside the reviewed game scope");
  return recoverOfficialPrimaryEvents(
    await loadRetained2009PrimarySources(cache, gameId, input),
  );
}

async function classification(cache: HockeyDataCache, result: Recovery) {
  const differences = result.proof.onGoalCountDifferences;
  if (
    result.proof.requiresOnGoalClassificationReview !==
    Boolean(differences.length)
  )
    throw Error("Primary-event classification requirement differs");
  if (!differences.length) return undefined;
  // An explicit candidate avoids reentering the play-by-play getter.
  const reviewed = await replayOfficialOnGoalClassification(
    cache,
    result.proof.gameId,
    result.pbp,
  );
  if (
    reviewed.proof.groups.length !== differences.length ||
    differences.some((row) => {
      const groups = reviewed.proof.groups.filter(
        (g) => g.playerId === row.playerId,
      );
      return (
        groups.length !== 1 ||
        groups[0]!.officialOnGoalAttempts !== row.officialOnGoal ||
        groups[0]!.primaryLabeledOnGoalAttempts !== row.primaryOnGoal ||
        groups[0]!.officialGoals !== row.officialGoals
      );
    })
  )
    throw Error("Primary-event differences lack exact classification evidence");
  return reviewed;
}

/** Replays both primary recovery and any required classification certificate. */
export async function applyCachedOfficialPrimaryEvents<T>(
  cache: HockeyDataCache,
  gameId: number,
  input: T,
  originalRawSha256: string,
): Promise<T> {
  const proof = await cache.derived<Recovery["proof"]>(key(gameId));
  if (!proof) return input;
  if (
    proof.originalRawPbpSha256 !== originalRawSha256 ||
    proof.preOverlayEffectivePbpSha256 !== hash(JSON.stringify(input))
  )
    throw Error("Primary-event recovery input changed");
  const result = await recover(cache, gameId, input);
  if (JSON.stringify(result.proof) !== JSON.stringify(proof))
    throw Error("Primary-event recovery proof changed");
  const reviewed = await classification(cache, result);
  if (
    reviewed &&
    JSON.stringify(
      await cache.derived<OfficialOnGoalClassificationProof>(
        classificationKey(gameId),
      ),
    ) !== JSON.stringify(reviewed.proof)
  )
    throw Error(
      "Required primary-event classification proof is missing or changed",
    );
  return result.pbp as T;
}

/** Additive installation. Interrupted paired writes remain unusable until resumed. */
export async function collectOfficialPrimaryEvents(
  cache: HockeyDataCache,
  gameId: number,
) {
  if (
    !(REVIEWED_PRIMARY_RECOVERY_GAME_IDS as readonly number[]).includes(gameId)
  )
    throw Error("Primary-event collection is outside the reviewed game scope");
  const { fetchGamePlayByPlay } = await import("./game-value-source");
  const retained = cache.retainedView();
  const previous = await cache.derived<Recovery["proof"]>(key(gameId));
  if (previous) {
    await fetchGamePlayByPlay(retained, gameId);
    return previous;
  }
  const input = await fetchGamePlayByPlay(retained, gameId);
  const result = await recover(retained, gameId, input);
  const reviewed = await classification(retained, result);
  if (reviewed)
    await cache.saveDerived(
      classificationKey(gameId),
      reviewed.proof,
      reviewed.urls,
    );
  const suffix = String(gameId % 1e6).padStart(6, "0");
  await cache.saveDerived(key(gameId), result.proof, [
    `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
    `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`,
    `https://www.nhl.com/scores/htmlreports/20092010/PL${suffix}.HTM`,
    `https://www.nhl.com/scores/htmlreports/20092010/GS${suffix}.HTM`,
    result.proof.providerArchive.url,
  ]);
  if (
    JSON.stringify(await cache.derived(key(gameId))) !==
      JSON.stringify(result.proof) ||
    hash(JSON.stringify(await fetchGamePlayByPlay(retained, gameId))) !==
      result.proof.outputSha256
  )
    throw Error("Primary-event recovery readback differs");
  return result.proof;
}

import type { GameValueData } from "./game-value-input";

/** Retain publication evidence without copying per-player source stats or lineups. */
export function summarizeGameAudit(game: GameValueData) {
  return {
    gameId: game.gameId,
    date: game.date,
    eligible: game.eligible,
    shiftSource: game.shiftSource,
    issues: game.issues,
    corrections: game.corrections,
    gameSeconds: game.gameSeconds,
    usableProcessSeconds: game.usableProcessSeconds,
    officialShots: game.officialShots,
    verifiedShotCount: game.shots.length,
    individualOnlyShotCount: game.shots.filter(
      (shot) => shot.attribution === "individual-only",
    ).length,
    // Minimal identities/results allow independent totals and duplicate checks.
    penaltyShots: game.shots
      .filter((shot) => shot.attribution === "penalty-shot")
      .map(({ eventId, shooter, kind }) => ({ eventId, shooter, kind })),
  };
}

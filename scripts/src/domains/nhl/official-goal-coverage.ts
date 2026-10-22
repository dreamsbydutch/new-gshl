import type { SeasonPlayerReference } from "../../runtime/nhl-game-season-value";
import type { NhlRatingSource } from "./season-rating-input";
import type { GameValueData } from "./game-value-input";

export function assertOfficialGoalQualification(
  source: NhlRatingSource,
  coverage: ReturnType<typeof summarizeOfficialGoalCoverage>,
  ratings: ReadonlyArray<{
    playerId: number;
    position: string;
    status: string;
    componentCoverage: { missingGoals: number };
  }>,
) {
  const skaters = ratings.filter((p) => p.position !== "G"),
    byId = new Map(coverage.players.map((p) => [p.playerId, p])),
    official = new Map(
      source.skaters.summary.map((p) => [p.playerId, p.goals]),
    );
  if (
    byId.size !== coverage.players.length ||
    byId.size !== skaters.length ||
    new Set(skaters.map((p) => p.playerId)).size !== skaters.length
  )
    throw new Error("Official goal publication population differs");
  for (const rating of skaters) {
    const evidence = byId.get(rating.playerId),
      goals = official.get(rating.playerId);
    if (
      !evidence ||
      !Number.isInteger(goals) ||
      Number(goals) < 0 ||
      evidence.officialGoals !== goals ||
      !Number.isInteger(evidence.verifiedGoalCredits) ||
      evidence.verifiedGoalCredits < 0 ||
      evidence.verifiedGoalCredits > Number(goals) ||
      evidence.missingGoals !== Number(goals) - evidence.verifiedGoalCredits ||
      !Number.isInteger(rating.componentCoverage.missingGoals) ||
      rating.componentCoverage.missingGoals < evidence.missingGoals ||
      (evidence.missingGoals > 0 && rating.status === "rated")
    )
      throw new Error("Published qualification conceals official goal deficit");
  }
}

/** Independent official totals, deliberately separate from legacy rating features. */
export function withOfficialSkaterGoals<T extends SeasonPlayerReference>(
  reference: readonly T[],
  source: NhlRatingSource,
): Array<T & { officialGoals?: number }> {
  const official = new Map<number, { goals: number; position: "F" | "D" }>();
  for (const row of source.skaters.summary) {
    const id = row.playerId,
      goals = row.goals;
    if (
      !Number.isInteger(id) ||
      Number(id) <= 0 ||
      row.seasonId !== source.season ||
      official.has(Number(id)) ||
      !Number.isInteger(goals) ||
      Number(goals) < 0 ||
      !["C", "L", "R", "D"].includes(String(row.positionCode))
    )
      throw new Error(
        "Missing/invalid official skater goal totals or identity",
      );
    official.set(Number(id), {
      goals: Number(goals),
      position: row.positionCode === "D" ? "D" : "F",
    });
  }
  const ids = new Set<number>();
  return reference.map((p) => {
    if (ids.has(p.playerId))
      throw new Error("Duplicate official-goal reference identity");
    ids.add(p.playerId);
    if (p.position === "G") return { ...p };
    const row = official.get(p.playerId);
    if (
      !row ||
      row.position !== p.position ||
      (p.officialGoals !== undefined && p.officialGoals !== row.goals)
    )
      throw new Error(
        "Official-goal reference identity/position/total differs",
      );
    return { ...p, officialGoals: row.goals };
  });
}

/** Physical verified-event ledger; no predicted probabilities or model outputs. */
export type GameGoalEvidence = {
  gameId: number;
  shots: readonly Pick<
    GameValueData["shots"][number],
    "eventId" | "shooter" | "goalie" | "kind"
  >[];
};
export function summarizeOfficialGoalCoverage(
  games: readonly GameGoalEvidence[],
  reference: readonly SeasonPlayerReference[],
) {
  const gamesSeen = new Set<number>(),
    events = new Set<string>();
  const credits = new Map<number, number>();
  const ledger: Array<{
    gameId: number;
    eventId: number;
    shooter: number;
    goalie: number;
  }> = [];
  for (const game of games) {
    if (gamesSeen.has(game.gameId))
      throw new Error("Duplicate game in official goal ledger");
    gamesSeen.add(game.gameId);
    for (const shot of game.shots)
      if (shot.kind === "GOAL") {
        const key = `${game.gameId}:${shot.eventId}`;
        if (!Number.isInteger(shot.eventId) || events.has(key))
          throw new Error("Invalid/duplicate verified GOAL identity");
        events.add(key);
        credits.set(shot.shooter, (credits.get(shot.shooter) ?? 0) + 1);
        ledger.push({
          gameId: game.gameId,
          eventId: shot.eventId,
          shooter: shot.shooter,
          goalie: shot.goalie,
        });
      }
  }
  const players = reference
    .filter((p) => p.position !== "G")
    .map((p) => {
      const goals = credits.get(p.playerId) ?? 0,
        officialGoals = p.officialGoals;
      if (
        typeof officialGoals !== "number" ||
        !Number.isInteger(officialGoals) ||
        officialGoals < 0 ||
        goals > officialGoals
      )
        throw new Error("Missing/invalid/overcredited official goal evidence");
      return {
        playerId: p.playerId,
        officialGoals,
        verifiedGoalCredits: goals,
        missingGoals: officialGoals - goals,
      };
    });
  if (
    new Set(reference.map((p) => p.playerId)).size !== reference.length ||
    ledger.some((s) => !reference.some((p) => p.playerId === s.shooter))
  )
    throw new Error("Unrepresented or duplicate official goal reference");
  return {
    version: "nhl-official-goal-coverage-v1" as const,
    games: gamesSeen.size,
    players,
    ledger,
    missingGoals: players.reduce((n, p) => n + p.missingGoals, 0),
    interpretation:
      "Canonical official skater goals versus verified individual GOAL credit; deficits are unknown contribution, never imputed events or zero value.",
  };
}

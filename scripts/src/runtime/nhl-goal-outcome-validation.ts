import type {
  GameValueData,
  ValueStint,
} from "../domains/nhl/game-value-input";

export type GoalOutcomeRate = {
  minutes: number;
  shotsFaced: number;
  observedFinishing: number;
  observedSaving: number;
  finishingPer60: number;
  savingPer60: number;
  savingSupported: boolean;
};

/** Earlier-game residuals only; these are predictive diagnostics, not new season scores. */
export function fitGoalOutcomeAdjustments(
  games: readonly GameValueData[],
  priors: { finishingMinutes?: number; savingShots?: number } = {},
) {
  const finishingMinutes = priors.finishingMinutes ?? 600;
  const savingShots = priors.savingShots ?? 600;
  if ([finishingMinutes, savingShots].some((v) => !Number.isFinite(v) || v < 0))
    throw new Error("Invalid goal-outcome shrinkage prior");
  const identities = new Set<number>();
  for (const game of games) {
    if (identities.has(game.gameId))
      throw new Error("Duplicate goal-outcome training game");
    identities.add(game.gameId);
  }
  const eligible = games.filter((g) => g.eligible);
  const totals = new Map<
    number,
    {
      minutes: number;
      shots: number;
      finishing: number;
      saving: number;
      goalie: boolean;
    }
  >();
  for (const game of eligible) {
    for (const player of game.players) {
      const total = totals.get(player.id) ?? {
        minutes: 0,
        shots: 0,
        finishing: 0,
        saving: 0,
        goalie: false,
      };
      total.minutes += player.seconds / 60;
      if (player.position === "G") {
        total.goalie = true;
        total.shots += player.shotsAgainst;
      }
      totals.set(player.id, total);
    }
    for (const shot of game.shots) {
      const finishing = (shot.kind === "GOAL" ? 1 : 0) - shot.xg;
      const shooter = totals.get(shot.shooter);
      if (shooter) shooter.finishing += finishing;
      const goalie = totals.get(shot.goalie);
      if (goalie) goalie.saving -= finishing;
    }
  }
  const rates: Record<number, GoalOutcomeRate> = {};
  const zeroShotGoalies: number[] = [];
  const playersWithoutMinutes: number[] = [];
  for (const [id, total] of totals) {
    if (total.goalie && !total.shots) zeroShotGoalies.push(id);
    if (!total.minutes) playersWithoutMinutes.push(id);
    const savingSupported =
      total.goalie && total.minutes > 0 && total.shots > 0;
    rates[id] = {
      minutes: total.minutes,
      shotsFaced: total.shots,
      observedFinishing: total.finishing,
      observedSaving: total.saving,
      finishingPer60:
        total.minutes > 0
          ? (total.finishing * 60) / (total.minutes + finishingMinutes)
          : 0,
      savingPer60: savingSupported
        ? (((total.saving * total.shots) / (total.shots + savingShots)) * 60) /
          total.minutes
        : 0,
      savingSupported,
    };
  }
  return {
    priors: { finishingMinutes, savingShots },
    rates,
    training: {
      games: eligible.length,
      excludedGames: games.length - eligible.length,
      gameIds: eligible.map((g) => g.gameId).sort((a, b) => a - b),
      dates: [...new Set(eligible.map((g) => g.date))].sort(),
      players: totals.size,
      zeroShotGoalies: zeroShotGoalies.sort((a, b) => a - b),
      playersWithoutMinutes: playersWithoutMinutes.sort((a, b) => a - b),
    },
  };
}

type Adjustments = ReturnType<typeof fitGoalOutcomeAdjustments>;
type Predictor = (stint: ValueStint, home: boolean) => number | null;
const variants = [
  "baselineChance",
  "finishingOnly",
  "savingOnly",
  "combined",
] as const;

/** All variants use the same supported games and actual deployment, not future outcomes as features. */
export function evaluateGoalOutcomes(
  games: readonly GameValueData[],
  adjustments: Adjustments,
  predictStint: Predictor,
) {
  const accumulators = Object.fromEntries(
    variants.map((name) => [
      name,
      {
        teamError: 0,
        differentialError: 0,
        correct: 0,
      },
    ]),
  ) as Record<
    (typeof variants)[number],
    { teamError: number; differentialError: number; correct: number }
  >;
  const supportedGameIds: number[] = [];
  let unsupportedGames = 0,
    decisions = 0;
  const unknownFinishing = new Set<number>(),
    unknownSaving = new Set<number>();
  const trainingIds = new Set(adjustments.training.gameIds);
  const lastTrainingDate = adjustments.training.dates.at(-1);
  const identities = new Set<number>();
  for (const game of games) {
    if (identities.has(game.gameId))
      throw new Error("Duplicate goal-outcome evaluation game");
    identities.add(game.gameId);
    if (
      trainingIds.has(game.gameId) ||
      (lastTrainingDate && game.date <= lastTrainingDate)
    )
      throw new Error("Goal-outcome evaluation must follow training games");
    if (!game.eligible) continue;
    const predictions = game.stints.map((stint) => ({
      stint,
      home: predictStint(stint, true),
      away: predictStint(stint, false),
    }));
    if (predictions.some((p) => p.home === null || p.away === null)) {
      unsupportedGames++;
      continue;
    }
    const totals = Object.fromEntries(
      variants.map((name) => [name, [0, 0]]),
    ) as Record<(typeof variants)[number], number[]>;
    for (const prediction of predictions) {
      const s = prediction.stint,
        hours = s.seconds / 3600;
      for (const home of [true, false]) {
        const side = home ? 0 : 1;
        const goalie = home ? s.homeGoalie : s.awayGoalie;
        const opposingGoalie = home ? s.awayGoalie : s.homeGoalie;
        const own = new Set(home ? s.home : s.away);
        if (goalie !== null) own.add(goalie);
        let finishing = 0;
        for (const id of own) {
          const rate = adjustments.rates[id];
          if (!rate || !rate.minutes) unknownFinishing.add(id);
          finishing += hours * (rate?.finishingPer60 ?? 0);
        }
        const savingRate =
          opposingGoalie === null
            ? undefined
            : adjustments.rates[opposingGoalie];
        if (opposingGoalie !== null && !savingRate?.savingSupported)
          unknownSaving.add(opposingGoalie);
        const saving = hours * (savingRate?.savingPer60 ?? 0);
        const baseline = (home ? prediction.home : prediction.away)!;
        totals.baselineChance[side]! += Math.max(0, baseline);
        totals.finishingOnly[side]! += Math.max(0, baseline + finishing);
        totals.savingOnly[side]! += Math.max(0, baseline - saving);
        totals.combined[side]! += Math.max(0, baseline + finishing - saving);
      }
    }
    // Condition on verified penalty-shot opportunities equally for every variant.
    const penaltyShots = [0, 0];
    for (const shot of game.shots.filter(
      (s) => s.attribution === "penalty-shot",
    ))
      penaltyShots[shot.home ? 0 : 1]! += shot.xg;
    const actualDiff = game.homeGoals - game.awayGoals;
    if (actualDiff !== 0) decisions++;
    for (const name of variants) {
      const home = totals[name][0]! + penaltyShots[0]!;
      const away = totals[name][1]! + penaltyShots[1]!;
      const accumulator = accumulators[name];
      accumulator.teamError +=
        (home - game.homeGoals) ** 2 + (away - game.awayGoals) ** 2;
      accumulator.differentialError += (home - away - actualDiff) ** 2;
      if (actualDiff !== 0 && Math.sign(home - away) === Math.sign(actualDiff))
        accumulator.correct++;
    }
    supportedGameIds.push(game.gameId);
  }
  const n = supportedGameIds.length;
  return {
    training: adjustments.training,
    priors: adjustments.priors,
    games: n,
    unsupportedGames,
    eligibleGames: games.filter((g) => g.eligible).length,
    supportedFraction: n + unsupportedGames ? n / (n + unsupportedGames) : null,
    supportedGameIds,
    unknownFinishingPlayers: [...unknownFinishing].sort((a, b) => a - b),
    unknownSavingGoalies: [...unknownSaving].sort((a, b) => a - b),
    variants: Object.fromEntries(
      variants.map((name) => [
        name,
        {
          teamGoalMse: n ? accumulators[name].teamError / (2 * n) : null,
          goalDifferentialMse: n
            ? accumulators[name].differentialError / n
            : null,
          nonShootoutDecisions: decisions,
          nonShootoutDecisionAccuracy: decisions
            ? accumulators[name].correct / decisions
            : null,
        },
      ]),
    ),
    interpretation:
      "Conditional on observed deployment and penalty-shot opportunities; fixed earlier-game residual priors. Unknown player rates contribute zero and are reported, not qualified estimates. No penalty adjustment is added to observed manpower. This diagnostic does not establish causal individual attribution.",
  };
}

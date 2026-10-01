import type {
  GameValueData,
  PenaltyEvent,
} from "../domains/nhl/game-value-input";
import {
  NHL_ADJUSTED_IMPACT_CONFIG,
  strengthFamily,
  situationFor,
  impactFeatures,
  type ImpactModel,
} from "./nhl-adjusted-impact";
import type { NhlPosition } from "./nhl-season-rating";

export type PenaltyValuation = {
  playerId: number;
  value: number;
  eventId: number;
};
export function valuePenaltyEvents(
  game: GameValueData,
  rates: Record<string, number>,
) {
  const entries: PenaltyValuation[] = [],
    unpriced: number[] = [];
  const groups = new Map<number, PenaltyEvent[]>();
  for (const p of game.penalties) {
    const group = groups.get(p.second) ?? [];
    group.push({ ...p });
    groups.set(p.second, group);
  }
  let coincidentalMinutes = 0;
  for (const group of groups.values()) {
    // Later records at the same whistle can already reflect an earlier assessment.
    const initial = group[0]!;
    let homeStrength = initial.homeBefore,
      awayStrength = initial.awayBefore;
    // Matching majors offset majors; two-minute portions of double minors offset ordinary minors.
    for (const major of [true, false]) {
      const home = group.filter(
        (p) => p.team === game.homeTeam && (p.kind === "major") === major,
      );
      const away = group.filter(
        (p) => p.team === game.awayTeam && (p.kind === "major") === major,
      );
      // Match reciprocal participants before unrelated same-whistle penalties.
      for (const h of home)
        for (const a of away.filter(
          (a) =>
            h.committed !== null &&
            a.committed !== null &&
            h.committed === a.drawn &&
            a.committed === h.drawn,
        )) {
          const offset = Math.min(h.minutes, a.minutes);
          h.minutes -= offset;
          a.minutes -= offset;
          coincidentalMinutes += offset * 2;
        }
      for (const h of home)
        for (const a of away) {
          const offset = Math.min(h.minutes, a.minutes);
          h.minutes -= offset;
          a.minutes -= offset;
          coincidentalMinutes += offset * 2;
        }
    }
    const serial = new Set(
      group
        .filter(
          (p) =>
            p.minutes > 0 &&
            p.committed !== null &&
            group.some(
              (q) => q !== p && q.minutes > 0 && q.committed === p.committed,
            ),
        )
        .map((p) => p.committed),
    );
    // Multiple residual assessments to one player are served sequentially, not
    // as two missing skaters. A full clock is needed to assign their marginal costs.
    for (const p of group.filter((p) => p.minutes > 0)) {
      if (p.remainingSeconds === 0) continue; // No future ice time after the game has ended.
      if (serial.size) {
        unpriced.push(p.eventId);
        continue;
      }
      const home = p.team === game.homeTeam;
      const own = home ? homeStrength : awayStrength,
        other = home ? awayStrength : homeStrength;
      if (
        own === null ||
        other === null ||
        own < 3 ||
        other < 3 ||
        own > 5 ||
        other > 5
      ) {
        unpriced.push(p.eventId);
        continue;
      }
      const addOpponent = p.regularSeasonOvertime && own === 3 && other < 5;
      if (own <= 3 && !addOpponent) {
        unpriced.push(p.eventId);
        continue;
      } // Queued penalty requires a full penalty-clock reconstruction.
      const afterOwn = addOpponent ? own : own - 1,
        afterOther = addOpponent ? other + 1 : other;
      homeStrength = home ? afterOwn : afterOther;
      awayStrength = home ? afterOther : afterOwn;
      const beforeFor = rates[`${own}v${other}:GG`],
        beforeAgainst = rates[`${other}v${own}:GG`];
      const afterFor = rates[`${afterOwn}v${afterOther}:GG`],
        afterAgainst = rates[`${afterOther}v${afterOwn}:GG`];
      if (
        [beforeFor, beforeAgainst, afterFor, afterAgainst].some(
          (r) => r === undefined || !Number.isFinite(r) || r < 0,
        )
      ) {
        unpriced.push(p.eventId);
        continue;
      }
      const change = Math.max(
        0,
        beforeFor! - beforeAgainst! - (afterFor! - afterAgainst!),
      );
      // Either side scoring ends sudden-death overtime. Use the scheduled clock,
      // never the eventual goal time, to avoid outcome-dependent penalty costs.
      const hazardPerMinute =
        (afterAgainst! + (p.regularSeasonOvertime ? afterFor! : 0)) / 60;
      const available =
        p.remainingSeconds === null
          ? Infinity
          : Math.max(0, p.remainingSeconds / 60);
      const duration = Math.min(2, available);
      const minorMinutes =
        hazardPerMinute > 0
          ? -Math.expm1(-duration * hazardPerMinute) / hazardPerMinute
          : duration;
      // In sudden death a goal ends the game, even during a major/double minor.
      const overtimeDuration = Math.min(p.minutes, available);
      const exposure = p.regularSeasonOvertime
        ? hazardPerMinute > 0
          ? -Math.expm1(-overtimeDuration * hazardPerMinute) / hazardPerMinute
          : overtimeDuration
        : p.kind === "major"
          ? Math.min(p.minutes, available)
          : (p.minutes / 2) * minorMinutes;
      const cost = (change * exposure) / 60;
      if (p.committed !== null)
        entries.push({
          playerId: p.committed,
          value: -cost,
          eventId: p.eventId,
        });
      if (p.drawn !== null)
        entries.push({ playerId: p.drawn, value: cost, eventId: p.eventId });
    }
  }
  return { entries, unpriced, coincidentalMinutes };
}

export type SeasonPlayerReference = {
  playerId: number;
  name: string;
  position: NhlPosition;
  minutes: number;
  games: number;
};
type PlayerGameValue = {
  seconds: number;
  officialSeconds: number;
  expectedShots: number;
  matchedShots: number;
  missingGoals: number;
  process: number;
  observedProcess: number;
  finishing: number;
  penalties: number;
  saving: number;
  shots: number;
};
export type GameSeasonRating = {
  playerId: number;
  name: string;
  position: NhlPosition;
  status: "rated" | "provisional" | "incomplete";
  games: number;
  verifiedGames: number;
  includedGames: number;
  minutes: number;
  modeledMinutes: number;
  coverage: number;
  componentCoverage: {
    officialMinutes: number;
    processMinutes: number;
    individualShots: number;
    missingGoals: number;
  };
  seasonValue: number | null;
  observedValue: number | null;
  abilityPer60: number | null;
  seasonRank: number | null;
  abilityRank: number | null;
  seasonRating: number | null;
  components: {
    adjustedProcess: number;
    observedProcess: number;
    finishing: number;
    penalties: number;
    saving: number;
  };
  situations: Record<string, number>;
  samplingInterval: {
    low: number;
    high: number;
    bestRank: number;
    worstRank: number;
  } | null;
  warnings: string[];
};
const round = (x: number) => {
  const rounded = Math.round(x * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
};

/** Season contribution retains actual finishing; ability shrinks it independently of the season ranking. */
export function rankGameSeason(
  games: GameValueData[],
  model: ImpactModel,
  reference: SeasonPlayerReference[],
  priors: Record<string, { prior: number }> = {},
) {
  const values = new Map<number, Map<number, PlayerGameValue>>();
  const situations = new Map<number, Record<string, number>>();
  const rates = Object.fromEntries(
    Object.entries(model.coefficients)
      .filter(([k]) => k.startsWith("B:"))
      .map(([k, v]) => [k.slice(2), Math.max(0, v)]),
  );
  const penaltyDiagnostics: Array<{
    gameId: number;
    unpriced: number[];
    coincidentalMinutes: number;
  }> = [];
  const penaltyWarnings = new Map<number, number>();
  const goalieWarnings = new Map<number, number>();
  const partialGames = new Map<number, number>();
  const row = (id: number, game: number) => {
    const player = values.get(id) ?? new Map<number, PlayerGameValue>();
    const value = player.get(game) ?? {
      seconds: 0,
      officialSeconds: 0,
      expectedShots: 0,
      matchedShots: 0,
      missingGoals: 0,
      process: 0,
      observedProcess: 0,
      finishing: 0,
      penalties: 0,
      saving: 0,
      shots: 0,
    };
    player.set(game, value);
    values.set(id, player);
    return value;
  };
  const verifiedIds = new Set(
    games.filter((g) => g.eligible).map((g) => g.gameId),
  );
  for (const g of games) {
    for (const player of g.players) {
      const value = row(player.id, g.gameId),
        coverage = g.shotCoverageByPlayer[player.id];
      value.officialSeconds = player.seconds;
      value.expectedShots = coverage?.expected ?? 0;
      value.matchedShots = coverage?.matched ?? 0;
      value.missingGoals = coverage?.missingGoals ?? 0;
      if (!g.eligible)
        partialGames.set(player.id, (partialGames.get(player.id) ?? 0) + 1);
    }
    for (const discrepancy of g.goalieReconciliation) {
      const value = row(discrepancy.playerId, g.gameId);
      value.missingGoals = Math.max(
        value.missingGoals,
        Math.abs(discrepancy.officialGoals - discrepancy.verifiedGoals),
      );
      goalieWarnings.set(
        discrepancy.playerId,
        (goalieWarnings.get(discrepancy.playerId) ?? 0) + 1,
      );
    }
    for (const s of g.stints.filter((s) => s.usableForProcess !== false))
      for (const home of [true, false]) {
        const own = home ? s.home : s.away,
          ownGoalie = home ? s.homeGoalie : s.awayGoalie;
        const family = strengthFamily(s, home),
          h = s.seconds / 3600;
        const expectedFor =
          impactFeatures(s, home, false).reduce(
            (n, key) => n + (model.coefficients[key] ?? 0),
            0,
          ) * h;
        const expectedAgainst =
          impactFeatures(s, !home, false).reduce(
            (n, key) => n + (model.coefficients[key] ?? 0),
            0,
          ) * h;
        const actualDiff = home ? s.homeXg - s.awayXg : s.awayXg - s.homeXg;
        for (const id of own) {
          const p = row(id, g.gameId);
          p.seconds += s.seconds;
          p.process +=
            ((model.coefficients[`O:${family}:${id}`] ?? 0) -
              (model.coefficients[`D:${family}:${id}`] ?? 0)) *
            h;
          p.observedProcess +=
            (actualDiff - expectedFor + expectedAgainst) / own.length;
          const usage = situations.get(id) ?? {};
          const situation = situationFor(s, home);
          usage[situation] = (usage[situation] ?? 0) + s.seconds / 60;
          situations.set(id, usage);
        }
        if (ownGoalie) row(ownGoalie, g.gameId).seconds += s.seconds;
      }
    for (const shot of g.shots) {
      row(shot.shooter, g.gameId).finishing +=
        (shot.kind === "GOAL" ? 1 : 0) - shot.xg;
      if (shot.goalie)
        row(shot.goalie, g.gameId).saving +=
          shot.xg - (shot.kind === "GOAL" ? 1 : 0);
      if (shot.attribution === "penalty-shot") {
        if (shot.penaltyCommitted != null)
          row(shot.penaltyCommitted, g.gameId).penalties -= shot.xg;
        if (shot.penaltyDrawn != null)
          row(shot.penaltyDrawn, g.gameId).penalties += shot.xg;
      }
    }
    for (const goalie of g.players.filter((p) => p.position === "G"))
      row(goalie.id, g.gameId).shots = goalie.shotsAgainst;
    const penalty = valuePenaltyEvents(g, rates);
    penaltyDiagnostics.push({
      gameId: g.gameId,
      unpriced: penalty.unpriced,
      coincidentalMinutes: penalty.coincidentalMinutes,
    });
    for (const event of g.penalties.filter((p) =>
      penalty.unpriced.includes(p.eventId),
    ))
      for (const id of [event.committed, event.drawn])
        if (id !== null)
          penaltyWarnings.set(id, (penaltyWarnings.get(id) ?? 0) + 1);
    for (const entry of penalty.entries)
      row(entry.playerId, g.gameId).penalties += entry.value;
  }
  const ratings: GameSeasonRating[] = reference.map((p) => {
    const rows = [...(values.get(p.playerId)?.values() ?? [])];
    const total = rows.reduce(
      (a, r) => ({
        seconds: a.seconds + r.seconds,
        officialSeconds: a.officialSeconds + r.officialSeconds,
        expectedShots: a.expectedShots + r.expectedShots,
        matchedShots: a.matchedShots + r.matchedShots,
        missingGoals: a.missingGoals + r.missingGoals,
        process: a.process + r.process,
        observedProcess: a.observedProcess + r.observedProcess,
        finishing: a.finishing + r.finishing,
        penalties: a.penalties + r.penalties,
        saving: a.saving + r.saving,
        shots: a.shots + r.shots,
      }),
      {
        seconds: 0,
        officialSeconds: 0,
        expectedShots: 0,
        matchedShots: 0,
        missingGoals: 0,
        process: 0,
        observedProcess: 0,
        finishing: 0,
        penalties: 0,
        saving: 0,
        shots: 0,
      },
    );
    const officialMinutes = total.officialSeconds / 60,
      officialCoverage = p.minutes ? officialMinutes / p.minutes : 0,
      individualCoverage = total.expectedShots
        ? total.matchedShots / total.expectedShots
        : 1,
      modeledMinutes =
        p.position === "G" ? officialMinutes : total.seconds / 60,
      coverage = p.minutes ? modeledMinutes / p.minutes : 0;
    const threshold = p.position === "G" ? 300 : 200;
    const status =
      officialCoverage < NHL_ADJUSTED_IMPACT_CONFIG.minimumPlayerCoverage ||
      officialCoverage > 1.03
        ? "incomplete"
        : coverage < NHL_ADJUSTED_IMPACT_CONFIG.minimumPlayerCoverage ||
            coverage > 1.03 ||
            individualCoverage < 0.95 ||
            total.missingGoals > 0 ||
            officialMinutes < threshold ||
            (p.position === "G" && !total.shots)
          ? "provisional"
          : "rated";
    const observed =
      p.position === "G"
        ? total.saving + total.finishing + total.penalties
        : total.observedProcess + total.finishing + total.penalties;
    const value =
      p.position === "G"
        ? total.saving + total.finishing + total.penalties
        : total.process + total.finishing + total.penalties;
    const finishingPrior = priors[`${p.position}:finishing`]?.prior ?? 600,
      penaltyPrior = priors[`${p.position}:penalties`]?.prior ?? 300,
      goaliePrior = priors["G:saving"]?.prior ?? 600;
    const penaltyAbility = officialMinutes
      ? (total.penalties * officialMinutes) / (officialMinutes + penaltyPrior)
      : 0;
    const finishingAbility = officialMinutes
      ? (total.finishing * officialMinutes) / (officialMinutes + finishingPrior)
      : 0;
    const ability =
      p.position === "G"
        ? (total.shots
            ? (total.saving * total.shots) / (total.shots + goaliePrior)
            : 0) +
          finishingAbility +
          penaltyAbility
        : total.process + finishingAbility + penaltyAbility;
    return {
      playerId: p.playerId,
      name: p.name,
      position: p.position,
      status,
      games: p.games,
      verifiedGames: [...(values.get(p.playerId)?.keys() ?? [])].filter((id) =>
        verifiedIds.has(id),
      ).length,
      includedGames: rows.length,
      minutes: p.minutes,
      modeledMinutes: round(modeledMinutes),
      coverage: round(coverage),
      componentCoverage: {
        officialMinutes: round(officialCoverage),
        processMinutes: round(p.minutes ? total.seconds / 60 / p.minutes : 0),
        individualShots: round(individualCoverage),
        missingGoals: total.missingGoals,
      },
      seasonValue: status === "incomplete" ? null : round(value),
      observedValue: status === "incomplete" ? null : round(observed),
      abilityPer60:
        status === "incomplete" ||
        !officialMinutes ||
        (p.position === "G" && !total.shots)
          ? null
          : round((ability * 60) / officialMinutes),
      seasonRank: null,
      abilityRank: null,
      seasonRating: null,
      components: {
        adjustedProcess: round(total.process),
        observedProcess: round(total.observedProcess),
        finishing: round(total.finishing),
        penalties: round(total.penalties),
        saving: round(total.saving),
      },
      situations: situations.get(p.playerId) ?? {},
      samplingInterval: null,
      warnings: [
        ...(partialGames.has(p.playerId)
          ? [
              `${partialGames.get(p.playerId)} games included with component-level source warnings; uncertain lineup intervals are excluded, verified individual events retained`,
            ]
          : []),
        ...(individualCoverage < 1 || total.missingGoals
          ? [
              "Some individual shot value is unavailable; component coverage reports the gap",
            ]
          : []),
        ...(goalieWarnings.has(p.playerId)
          ? [
              `${goalieWarnings.get(p.playerId)} games have NHL event/game-report shot classification or exposure differences; game-report shots supply shrinkage exposure`,
            ]
          : []),
        ...(coverage < 0.999
          ? [
              "Some official exposure is unmodeled; no missing-game extrapolation",
            ]
          : []),
        ...(!model.converged
          ? ["Ridge solver reached its iteration limit"]
          : []),
        ...(penaltyWarnings.has(p.playerId)
          ? [
              `${penaltyWarnings.get(p.playerId)} penalty events have missing context, queued clocks or unsupported strength`,
            ]
          : []),
        ...(p.position === "G" && !total.shots
          ? ["No shots faced; saving ability is unknown"]
          : []),
      ],
    };
  });
  for (const position of ["F", "D", "G"] as const) {
    const pool = ratings.filter(
      (r) => r.position === position && r.status === "rated",
    );
    for (const p of pool) {
      const better = pool.filter((q) => q.seasonValue! > p.seasonValue!).length,
        equal = pool.filter((q) => q.seasonValue === p.seasonValue).length;
      p.seasonRank = better + 1;
      p.abilityRank =
        pool.filter((q) => q.abilityPer60! > p.abilityPer60!).length + 1;
      p.seasonRating =
        pool.length > 1
          ? round(
              (100 * (pool.length - better - (equal + 1) / 2)) /
                (pool.length - 1),
            )
          : 50;
    }
  }
  // Cluster bootstrap samples whole games, preserving same-game player dependence. Coefficients stay fixed.
  let seed = 14731;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const samples = new Map<number, { values: number[]; ranks: number[] }>();
  const ranked = ratings.filter((p) => p.status === "rated");
  const byGame = new Map<number, Array<{ id: number; value: number }>>();
  for (const p of ranked) {
    samples.set(p.playerId, { values: [], ranks: [] });
    for (const [gameId, v] of values.get(p.playerId) ?? []) {
      const list = byGame.get(gameId) ?? [];
      list.push({
        id: p.playerId,
        value:
          p.position === "G"
            ? v.saving + v.finishing + v.penalties
            : v.process + v.finishing + v.penalties,
      });
      byGame.set(gameId, list);
    }
  }
  for (
    let replicate = 0;
    replicate < NHL_ADJUSTED_IMPACT_CONFIG.bootstrapReplicates;
    replicate++
  ) {
    const totals = new Map<number, number>();
    for (let i = 0; i < games.length; i++)
      for (const p of byGame.get(
        games[Math.floor(random() * games.length)]!.gameId,
      ) ?? [])
        totals.set(p.id, (totals.get(p.id) ?? 0) + p.value);
    for (const position of ["F", "D", "G"] as const) {
      const pool = ranked
        .filter((p) => p.position === position)
        .sort(
          (a, b) =>
            (totals.get(b.playerId) ?? 0) - (totals.get(a.playerId) ?? 0),
        );
      let rank = 1;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i]!,
          s = samples.get(p.playerId)!;
        s.values.push(totals.get(p.playerId) ?? 0);
        if (
          i > 0 &&
          round(totals.get(p.playerId) ?? 0) !==
            round(totals.get(pool[i - 1]!.playerId) ?? 0)
        )
          rank = i + 1;
        s.ranks.push(rank);
      }
    }
  }
  const percentile = (a: number[], fraction: number) =>
    [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * fraction)]!;
  for (const p of ranked) {
    const s = samples.get(p.playerId)!;
    p.samplingInterval = {
      low: round(percentile(s.values, 0.025)),
      high: round(percentile(s.values, 0.975)),
      bestRank: percentile(s.ranks, 0.025),
      worstRank: percentile(s.ranks, 0.975),
    };
  }
  return {
    ratings: ratings.sort(
      (a, b) =>
        a.position.localeCompare(b.position) ||
        (a.seasonRank ?? Infinity) - (b.seasonRank ?? Infinity) ||
        a.playerId - b.playerId,
    ),
    penaltyDiagnostics,
  };
}

import type {
  BuilderGame,
  BuilderTeam,
  PairHistory,
} from "../../types/schedule-builder";

export function pairKey(a: string, b: string) {
  return JSON.stringify([a, b].sort());
}

/** Merge season batches without losing repeated owner pairs across franchises. */
export function combineScheduleHistory(
  batches: readonly { history: PairHistory[]; excluded: number }[],
) {
  const pairs = new Map<string, PairHistory>();
  let excluded = 0;
  for (const batch of batches) {
    excluded += batch.excluded;
    for (const record of batch.history) {
      const key = pairKey(record.a, record.b);
      const existing = pairs.get(key);
      if (existing) {
        existing.games += record.games;
        existing.aHome += record.aHome;
      } else pairs.set(key, { ...record });
    }
  }
  return { history: [...pairs.values()], excluded };
}

export function validateBuilderTeams(teams: BuilderTeam[], weeks: number) {
  const conferences = new Set(teams.map((t) => t.conferenceId));
  if (
    teams.length !== 14 ||
    conferences.size !== 2 ||
    [...conferences].some(
      (id) => teams.filter((t) => t.conferenceId === id).length !== 7,
    ) ||
    new Set(teams.map((t) => t.id)).size !== 14 ||
    new Set(teams.map((t) => t.ownerId)).size !== 14
  ) {
    throw new Error(
      "The builder requires two conferences of seven distinct owners.",
    );
  }
  if (!Number.isInteger(weeks) || weeks < 19 || weeks > 49 || weeks % 2 === 0) {
    throw new Error(
      "Choose an odd number of weeks from 19 to 49. Conference games require an odd season length; every week needs at least one of the 49 cross-conference matchups.",
    );
  }
}

/** Validate independently of the generator; also used by the publishing transaction. */
export function validateSchedule(
  teams: BuilderTeam[],
  weeks: number,
  games: BuilderGame[],
) {
  validateBuilderTeams(teams, weeks);
  if (games.length !== weeks * 7)
    throw new Error("The schedule must have seven games per week.");
  const byId = new Map(teams.map((t) => [t.id, t]));
  const occupied = new Set<string>();
  const counts = new Map<string, number>();
  for (const game of games) {
    if (
      !Number.isInteger(game.week) ||
      game.week < 1 ||
      game.week > weeks ||
      game.home === game.away ||
      !byId.has(game.home) ||
      !byId.has(game.away)
    )
      throw new Error("Invalid matchup.");
    for (const id of [game.home, game.away]) {
      const key = `${game.week}:${id}`;
      if (occupied.has(key))
        throw new Error("A team cannot play twice in a week.");
      occupied.add(key);
    }
    const key = pairKey(game.home, game.away);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (let a = 0; a < teams.length; a++)
    for (let b = a + 1; b < teams.length; b++) {
      const first = teams[a]!;
      const second = teams[b]!;
      const count = counts.get(pairKey(first.id, second.id)) ?? 0;
      if (
        first.conferenceId === second.conferenceId ? count < 2 : count !== 1
      ) {
        throw new Error(
          "Every conference opponent needs at least two games; every other conference opponent needs exactly one.",
        );
      }
    }
}

export function scheduleBalance(
  teams: BuilderTeam[],
  history: PairHistory[],
  games: BuilderGame[],
) {
  const past = new Map(history.map((p) => [pairKey(p.a, p.b), p]));
  return teams.flatMap((a, i) =>
    teams.slice(i + 1).map((b) => {
      const record = past.get(pairKey(a.ownerId, b.ownerId));
      const beforeHome = record
        ? record.a === a.ownerId
          ? record.aHome
          : record.games - record.aHome
        : 0;
      const beforeAway = (record?.games ?? 0) - beforeHome;
      const meetings = games.filter(
        (g) => pairKey(g.home, g.away) === pairKey(a.id, b.id),
      );
      const home = meetings.filter((g) => g.home === a.id).length;
      const ordered = meetings.map((g) => g.week).sort((x, y) => x - y);
      const gap =
        ordered.length < 2
          ? null
          : Math.min(...ordered.slice(1).map((w, j) => w - ordered[j]!));
      return {
        a: a.name,
        b: b.name,
        conference: a.conferenceId === b.conferenceId,
        beforeHome,
        beforeAway,
        added: meetings.length,
        afterHome: beforeHome + home,
        afterAway: beforeAway + meetings.length - home,
        gap,
      };
    }),
  );
}

/** Seeded, bounded heuristic: hard constraints are validated; fairness and spacing are objectives. */
export function generateSchedule(
  teams: BuilderTeam[],
  weeks: number,
  history: PairHistory[],
  seed: number,
): BuilderGame[] {
  validateBuilderTeams(teams, weeks);
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new Error("Use an integer seed from 0 to 4294967295.");
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const shuffle = <T>(values: T[]) => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  };
  const past = new Map(history.map((p) => [pairKey(p.a, p.b), p]));
  const counts = Array.from({ length: 14 }, (_, a) =>
    Array.from({ length: 14 }, (_, b) =>
      a === b ? 0 : teams[a]!.conferenceId === teams[b]!.conferenceId ? 2 : 1,
    ),
  );
  // Each extra Hamiltonian cycle gives every team exactly two more conference games.
  // Search cycles by marginal squared historical meeting counts to favor underplayed pairs.
  for (const conference of new Set(teams.map((t) => t.conferenceId))) {
    const indices = teams
      .map((_, i) => i)
      .filter((i) => teams[i]!.conferenceId === conference);
    for (let extra = 19; extra < weeks; extra += 2) {
      let best = indices;
      let bestCost = Infinity;
      for (let trial = 0; trial < 500; trial++) {
        const cycle = shuffle(indices);
        const cost = cycle.reduce((sum, a, i) => {
          const b = cycle[(i + 1) % 7]!;
          return (
            sum +
            2 *
              ((past.get(pairKey(teams[a]!.ownerId, teams[b]!.ownerId))
                ?.games ?? 0) +
                counts[a]![b]!) +
            1
          );
        }, 0);
        if (cost < bestCost) {
          best = cycle;
          bestCost = cost;
        }
      }
      best.forEach((a, i) => {
        const b = best[(i + 1) % 7]!;
        counts[a]![b]!++;
        counts[b]![a]!++;
      });
    }
  }
  let result: [number, number][][] | null = null;
  // Decompose the regular multigraph into weekly perfect matchings.
  for (let attempt = 0; attempt < 30 && !result; attempt++) {
    const remaining = counts.map((row) => [...row]);
    const rounds: [number, number][][] = [];
    let budget = 20000;
    const solve = (week: number): boolean => {
      if (week === weeks) return true;
      if (--budget <= 0) return false;
      const matching: [number, number][] = [];
      const match = (free: number[]): boolean => {
        if (--budget <= 0) return false;
        if (!free.length) {
          const left = weeks - week - 1;
          let cross = 0;
          for (let a = 0; a < 14; a++)
            for (let b = a + 1; b < 14; b++) {
              if (remaining[a]![b]! > left) return false;
              if (teams[a]!.conferenceId !== teams[b]!.conferenceId)
                cross += remaining[a]![b]!;
            }
          if (cross < left) return false;
          rounds.push([...matching]);
          if (solve(week + 1)) return true;
          rounds.pop();
          return false;
        }
        const a = [...free].sort(
          (x, y) =>
            free.filter((b) => remaining[x]![b]! > 0).length -
            free.filter((b) => remaining[y]![b]! > 0).length,
        )[0]!;
        const candidates = shuffle(
          free.filter((b) => b !== a && remaining[a]![b]! > 0),
        );
        candidates.sort((x, y) => remaining[a]![y]! - remaining[a]![x]!);
        for (const b of candidates) {
          remaining[a]![b]!--;
          remaining[b]![a]!--;
          matching.push([a, b]);
          if (match(free.filter((id) => id !== a && id !== b))) return true;
          matching.pop();
          remaining[a]![b]!++;
          remaining[b]![a]!++;
        }
        return false;
      };
      return match(Array.from({ length: 14 }, (_, i) => i));
    };
    if (solve(0)) result = rounds;
  }
  if (!result)
    throw new Error(
      "No weekly layout found within the search budget. Try another seed.",
    );
  const spacingCost = (rounds: [number, number][][]) => {
    const last = new Map<string, number>();
    let cost = 0;
    rounds.forEach((round, week) =>
      round.forEach(([a, b]) => {
        const key = pairKey(String(a), String(b));
        const previous = last.get(key);
        if (previous !== undefined)
          cost += Math.max(0, 5 - (week - previous)) ** 2;
        last.set(key, week);
      }),
    );
    return cost;
  };
  result = shuffle(result);
  let cost = spacingCost(result);
  for (let trial = 0; trial < 3000; trial++) {
    const a = Math.floor(random() * weeks);
    const b = Math.floor(random() * weeks);
    [result[a], result[b]] = [result[b]!, result[a]!];
    const next = spacingCost(result);
    if (next <= cost) cost = next;
    else [result[a], result[b]] = [result[b], result[a]];
  }
  const balance = new Map<string, number>();
  const homes = teams.map(() => 0);
  const games = result.flatMap((round, week) =>
    round.map(([a, b]) => {
      const first = teams[a]!;
      const second = teams[b]!;
      const key = pairKey(first.ownerId, second.ownerId);
      const record = past.get(key);
      const initial = record
        ? (record.a === first.ownerId ? 1 : -1) *
          (2 * record.aHome - record.games)
        : 0;
      // Normalize to the sorted owner key regardless of the matching's endpoint order.
      const sign = first.ownerId < second.ownerId ? 1 : -1;
      const delta = (balance.get(key) ?? initial * sign) * sign;
      const firstHome =
        delta < 0 ||
        (delta === 0 &&
          (homes[a]! < homes[b]! || (homes[a] === homes[b] && random() < 0.5)));
      balance.set(key, (delta + (firstHome ? 1 : -1)) * sign);
      homes[firstHome ? a : b]!++;
      return {
        week: week + 1,
        home: firstHome ? first.id : second.id,
        away: firstHome ? second.id : first.id,
      };
    }),
  );
  validateSchedule(teams, weeks, games);
  return games;
}

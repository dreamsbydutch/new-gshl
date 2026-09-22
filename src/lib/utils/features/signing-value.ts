import type {
  DraftResultInput,
  DraftSigningContract,
  SigningValue,
  TeamSigningValue,
} from "../../types/draft-history";

/** Display-only historical benchmark; never used by the ranking engine or Calder. */
export function expectedSigningRating(salary: number | null): number | null {
  if (
    salary === null ||
    !Number.isFinite(salary) ||
    salary < 1_000_000 ||
    salary > 12_500_000
  )
    return null;
  const millions = salary / 1_000_000;
  return 34.482782976600674 + 17.762094214653004 * Math.sqrt(millions);
}

export function openingSigningSalary(
  contracts: DraftSigningContract[],
  playerId: string,
  ownerId: string,
  start: string | null,
): number | null {
  if (!start) return null;
  const eligible = contracts
    .filter(
      (row) =>
        row.playerId === playerId &&
        row.ownerId === ownerId &&
        row.start &&
        row.end &&
        row.signed &&
        row.start <= start &&
        row.end >= start &&
        row.signed <= start,
    )
    .sort(
      (a, b) =>
        b.start!.localeCompare(a.start!) || b.signed!.localeCompare(a.signed!),
    );
  const latest = eligible[0];
  if (!latest) return null;
  const sameDate = eligible.filter(
    (row) => row.start === latest.start && row.signed === latest.signed,
  );
  if (sameDate.some((row) => row.salary !== latest.salary)) return null;
  return latest.salary !== null &&
    Number.isFinite(latest.salary) &&
    latest.salary > 0
    ? latest.salary
    : null;
}

export function buildSigningValues(input: {
  picks: DraftResultInput[];
  teams: { id: string; ownerId: string | null }[];
  contracts: DraftSigningContract[];
  seasonStart: string | null;
  ratings: { playerId: string; rating: number | null }[];
}): { values: Map<string, SigningValue>; teams: TeamSigningValue[] } {
  const owners = new Map(input.teams.map((team) => [team.id, team.ownerId]));
  const ratings = new Map(
    input.ratings.map((row) => [row.playerId, row.rating]),
  );
  const values = new Map<string, SigningValue>();
  const groups = new Map<
    string,
    { total: number; values: number[]; players: Set<string> }
  >();
  for (const pick of input.picks) {
    if (!pick.isSigning || !pick.playerId || !pick.teamId) continue;
    const ownerId = owners.get(pick.teamId);
    const salary = ownerId
      ? openingSigningSalary(
          input.contracts,
          pick.playerId,
          ownerId,
          input.seasonStart,
        )
      : null;
    const expectedRating = expectedSigningRating(salary);
    const rating = ratings.get(pick.playerId);
    const value =
      expectedRating !== null && rating != null && Number.isFinite(rating)
        ? rating - expectedRating
        : null;
    values.set(pick.id, { salary, expectedRating, value });
    const group = groups.get(pick.teamId) ?? {
      total: 0,
      values: [],
      players: new Set<string>(),
    };
    // A duplicated historical pick cannot double-weight a player's signing.
    if (!group.players.has(pick.playerId)) {
      group.players.add(pick.playerId);
      group.total++;
      if (value !== null) group.values.push(value);
    }
    groups.set(pick.teamId, group);
  }
  const teams: TeamSigningValue[] = [...groups].map(([teamId, group]) => ({
    teamId,
    score: group.values.length
      ? Math.round(
          (group.values.reduce((sum, value) => sum + value, 0) /
            group.values.length) *
            10,
        ) / 10
      : null,
    rank: null,
    rankedTeams: 0,
    graded: group.values.length,
    total: group.total,
  }));
  const ranked = teams.filter((team) => team.score !== null);
  for (const team of teams) {
    team.rankedTeams = ranked.length;
    if (team.score !== null)
      team.rank =
        1 + ranked.filter((other) => other.score! > team.score!).length;
  }
  return { values, teams };
}

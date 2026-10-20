type SourcePerson = {
  sourceType: string;
  sourcePlayerId?: string;
  normalizedName: string;
  posGroup: string;
  age: string;
  sourceIndex: number;
  nhlTeam: string;
};

/** A source person, never just a shared display name. Missing ages cannot prove a trade join. */
export function hockeyReferencePersonKey(row: SourcePerson): string {
  const identity = row.sourcePlayerId
    ? `id:${row.sourcePlayerId}`
    : /^\d+$/.test(row.age) && Number(row.age) > 0
      ? `name:${row.normalizedName}|age:${Number(row.age)}`
      : `unknown:${row.sourceIndex}`;
  return `${row.sourceType}|${row.posGroup}|${identity}`;
}

export function collapseHockeyReferencePeople<T extends SourcePerson>(
  candidates: T[],
  isAggregateTeam: (team: string) => boolean,
): { rows: T[]; duplicateIncomingKeysCollapsed: number } {
  const groups = new Map<string, T[]>();
  for (const row of candidates) {
    const key = hockeyReferencePersonKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const rows = [...groups.values()].map(
    (group) =>
      group.find((row) => isAggregateTeam(row.nhlTeam)) ??
      [...group].sort((a, b) => a.sourceIndex - b.sourceIndex)[0]!,
  );
  rows.sort((a, b) => a.sourceIndex - b.sourceIndex);
  return {
    rows,
    duplicateIncomingKeysCollapsed: candidates.length - rows.length,
  };
}

function ageOnFebruaryFirst(
  birthday: unknown,
  endingYear: number,
): number | null {
  if (birthday === null || birthday === undefined || birthday === "")
    return null;
  const instant =
    typeof birthday === "number"
      ? birthday
      : typeof birthday === "string"
        ? /^\d+$/.test(birthday)
          ? Number(birthday)
          : Date.parse(birthday)
        : NaN;
  const birth = new Date(instant);
  if (!Number.isFinite(birth.getTime())) return null;
  const age =
    endingYear -
    birth.getUTCFullYear() -
    (birth.getUTCMonth() > 1 ||
    (birth.getUTCMonth() === 1 && birth.getUTCDate() > 1)
      ? 1
      : 0);
  return age > 0 && age < 100 ? age : null;
}

/** HRef season ages use February 1. Current teams and activity cannot identify homonyms. */
export function chooseHockeyReferencePerson<T extends { birthday?: unknown }>(
  age: string,
  endingSeasonYear: string,
  players: T[],
): T | null {
  if (players.length <= 1) return players[0] ?? null;
  if (!/^\d+$/.test(age) || !/^\d{4}$/.test(endingSeasonYear)) return null;
  const sourceAge = Number(age),
    year = Number(endingSeasonYear);
  if (sourceAge <= 0 || sourceAge >= 100) return null;
  const ages = players.map((player) =>
    ageOnFebruaryFirst(player.birthday, year),
  );
  // An unknown birthday could belong to the same age; it cannot be ruled out.
  if (ages.includes(null)) return null;
  const matching = players.filter(
    (_player, index) => ages[index] === sourceAge,
  );
  return matching.length === 1 ? matching[0]! : null;
}

/** Called before any season writes: even identical payloads may describe different people. */
export function assertUniqueIncomingHockeyReferencePlayer(
  seen: Set<string>,
  seasonPlayerKey: string,
): void {
  if (seen.has(seasonPlayerKey))
    throw new Error(
      `Multiple Hockey Reference people resolve to ${seasonPlayerKey}; refusing overwrite`,
    );
  seen.add(seasonPlayerKey);
}

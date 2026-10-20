import { normalizeDateOnlyValue } from "../../utils/date";

type Identity = { _id?: unknown; id?: unknown; seasonId?: unknown };
type Week = Identity & {
  startDate?: unknown;
  endDate?: unknown;
  weekType?: unknown;
  isPlayoffs?: unknown;
};
type Matchup = Identity & {
  weekId?: unknown;
  homeTeamId?: unknown;
  awayTeamId?: unknown;
};

function id(value: unknown): string {
  if (typeof value !== "string" || !value || value.trim() !== value)
    throw Error("Canonical roster calendar reference required");
  return value;
}
function identity(row: Identity): string {
  if (row._id !== undefined && row.id !== undefined && row._id !== row.id)
    throw Error("Conflicting canonical roster calendar identity");
  return id(row._id ?? row.id);
}
function day(value: unknown): string {
  // Canonical Convex instants are epoch milliseconds, not legacy spreadsheet serials.
  const normalized = normalizeDateOnlyValue(
    typeof value === "number" ? new Date(value) : value,
  );
  if (
    !normalized ||
    !Number.isFinite(Date.parse(normalized)) ||
    new Date(normalized).toISOString().slice(0, 10) !== normalized
  )
    throw Error("Valid nonempty scoring-week calendar required");
  return normalized;
}

/** Scoring membership must never stand in for complete league ownership. */
export function selectRosterScoringCohort<
  R extends { teamId: string },
  D extends { gshlTeamId: string },
>(
  scoringTeamIds: readonly string[],
  seasonTeamIds: readonly string[],
  rawRosters: readonly R[],
  existingDays: readonly D[],
): { rosters: R[]; existing: D[]; ownershipMaintenanceAllowed: boolean } {
  const all = new Set(seasonTeamIds.map(id));
  const scoring = new Set(scoringTeamIds.map(id));
  if (
    !scoring.size ||
    all.size !== seasonTeamIds.length ||
    scoring.size !== scoringTeamIds.length ||
    [...scoring].some((teamId) => !all.has(teamId))
  )
    throw Error("Unique scoring teams must belong to the season");
  const captured = new Set(rawRosters.map((r) => id(r.teamId)));
  if (
    captured.size !== rawRosters.length ||
    [...captured].some((teamId) => !all.has(teamId)) ||
    [...scoring].some((teamId) => !captured.has(teamId))
  )
    throw Error("Scoring roster capture is incomplete or ambiguous");
  return {
    rosters: rawRosters.filter((r) => scoring.has(r.teamId)),
    existing: existingDays.filter((r) => scoring.has(r.gshlTeamId)),
    ownershipMaintenanceAllowed: scoring.size === all.size,
  };
}

/** Missing postseason schedules never exempt every team; eliminated teams need no invented days. */
export function expectedRosterTeamIds(
  week: Week,
  seasonTeams: readonly Identity[],
  seasonMatchups: readonly Matchup[],
): string[] {
  const weekId = identity(week),
    seasonId = id(week.seasonId);
  if (day(week.startDate) > day(week.endDate))
    throw Error("Scoring-week calendar is reversed");
  if (
    week.weekType !== undefined &&
    week.weekType !== null &&
    week.weekType !== "" &&
    !["RS", "PO", "LT"].includes(String(week.weekType))
  )
    throw Error("Unknown scoring-week type");
  const teams = new Set<string>();
  for (const team of seasonTeams) {
    const teamId = identity(team);
    if (team.seasonId !== seasonId || teams.has(teamId))
      throw Error("Unique same-season roster teams required");
    teams.add(teamId);
  }
  if (!teams.size)
    throw Error("Nonempty season roster team inventory required");
  const postseason =
    week.weekType === "PO" ||
    week.weekType === "LT" ||
    week.isPlayoffs === true;
  if (!postseason) return [...teams].sort();
  const participants = new Set<string>(),
    matchups = new Set<string>();
  for (const matchup of seasonMatchups) {
    if (matchup.seasonId !== seasonId)
      throw Error("Postseason matchup belongs to another season");
    const matchupWeekId = id(matchup.weekId);
    const home = id(matchup.homeTeamId),
      away = id(matchup.awayTeamId);
    if (!teams.has(home) || !teams.has(away) || home === away)
      throw Error("Postseason matchup has invalid canonical team references");
    if (matchup._id !== undefined || matchup.id !== undefined) {
      const matchupId = identity(matchup);
      if (matchups.has(matchupId))
        throw Error("Duplicate postseason matchup identity");
      matchups.add(matchupId);
    }
    if (matchupWeekId === weekId) {
      participants.add(home);
      participants.add(away);
    }
  }
  return [...(participants.size ? participants : teams)].sort();
}

export type RosterSeason = Record<string, unknown> & {
  id: string;
  year?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  signingEndDate?: unknown;
  draftStartAt?: unknown;
};

export type RosterPlayer = Record<string, unknown> & {
  id: string;
  fullName?: unknown;
  ownerId?: unknown;
  // Transitional field used only to clear the previous Player relationship.
  gshlTeamId?: unknown;
  lineupPos?: unknown;
};

export type RosterPlayerDay = Record<string, unknown> & {
  playerId?: unknown;
  gshlTeamId?: unknown;
  date?: unknown;
};

export type RosterContract = Record<string, unknown> & {
  id?: unknown;
  playerId?: unknown;
  ownerId?: unknown;
  seasonId?: unknown;
  contractType?: unknown;
  contractLength?: unknown;
  signingDate?: unknown;
  startDate?: unknown;
  expiryDate?: unknown;
  capHitEndDate?: unknown;
  expiryStatus?: unknown;
};

export type RosterTeam = Record<string, unknown> & {
  id: string;
  seasonId?: unknown;
  franchiseId?: unknown;
};

export type RosterFranchise = Record<string, unknown> & {
  id: string;
  ownerId?: unknown;
};

export type RosterDraftPick = Record<string, unknown> & {
  id?: unknown;
  seasonId?: unknown;
  gshlTeamId?: unknown;
  playerId?: unknown;
};

export type RosterCalendar =
  | {
      phase: "inSeason";
      referenceDate: string;
      previousDate: string;
      rosterSeasonId: string;
      playerDaySeasonId: string;
      targetTeamSeasonId: string;
      seasonEndDate: string;
      draftDate: string;
    }
  | {
      phase: "signingPeriod";
      referenceDate: string;
      previousDate: string;
      rosterSeasonId: string;
      playerDaySeasonId: string;
      targetTeamSeasonId: string;
      seasonEndDate: string;
      draftDate: string;
    }
  | {
      phase: "offseasonContracts" | "postDraft";
      referenceDate: string;
      previousDate: string;
      rosterSeasonId: string;
      playerDaySeasonId: "";
      targetTeamSeasonId: string;
      seasonEndDate: string;
      draftDate: string;
    };

export type RosterSource =
  | {
      kind:
        | "playerDayCurrent"
        | "playerDayPrevious"
        | "playerDayLatestInSeason"
        | "signingPeriodFinalRoster";
      date: string;
      playerDays: readonly RosterPlayerDay[];
    }
  | {
      kind: "offseasonContracts" | "postDraftContractsAndPicks";
      date: string;
      playerDays: readonly [];
    };

export type RosterIssue = {
  kind:
    | "ambiguousOwnerTeam"
    | "conflictingPlayerOwner"
    | "conflictingLineupTeam"
    | "missingContractTeam"
    | "invalidPlayerDayTeam"
    | "invalidDraftTeam"
    | "unknownPlayer";
  playerId: string;
  ownerIds: string[];
  teamIds: string[];
  detail: string;
};

export type RosterUpdateReview = {
  playerId: string;
  fullName: string;
  previousOwnerId: string;
  nextOwnerId: string;
  previousLegacyTeamId: string;
  legacyTeamIdCleared: boolean;
  clearedLineupPos: boolean;
};

export type RosterReconciliation = {
  source: RosterSource["kind"];
  sourceDate: string;
  rosterSeasonId: string;
  targetTeamSeasonId: string;
  rosteredPlayers: number;
  playerDayAssignments: number;
  contractAssignments: number;
  draftPickAssignments: number;
  assignedPlayers: number;
  clearedPlayers: number;
  changedOwners: number;
  legacyTeamIdsCleared: number;
  unchangedPlayers: number;
  assignments: Array<{ playerId: string; ownerId: string; teamId: string }>;
  updates: Array<{ id: string; data: Record<string, unknown> }>;
  updateReviews: RosterUpdateReview[];
  issues: RosterIssue[];
};

function toText(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object" ||
    typeof value === "symbol"
  ) {
    return "";
  }
  return String(value).trim();
}

function dateOnly(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(toText(value));
  return match?.[1] ?? "";
}

function seasonYear(season: RosterSeason): number {
  const value = Number(toText(season.year));
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function orderSeasons(seasons: readonly RosterSeason[]): RosterSeason[] {
  return [...seasons].sort(
    (left, right) =>
      dateOnly(left.startDate).localeCompare(dateOnly(right.startDate)) ||
      seasonYear(left) - seasonYear(right) ||
      left.id.localeCompare(right.id),
  );
}

export function previousCalendarDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function torontoDate(referenceDate: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function draftDate(season: RosterSeason): string {
  if (season.draftStartAt instanceof Date) {
    return Number.isNaN(season.draftStartAt.getTime())
      ? ""
      : torontoDate(season.draftStartAt);
  }
  const raw = toText(season.draftStartAt);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? dateOnly(raw) : torontoDate(parsed);
}

export function resolveRosterCalendar(
  seasons: readonly RosterSeason[],
  referenceDate: Date,
): RosterCalendar {
  const ordered = orderSeasons(seasons).filter(
    (season) => dateOnly(season.startDate) && dateOnly(season.endDate),
  );
  const today = torontoDate(referenceDate);
  const previousDate = previousCalendarDate(today);
  const inSeason = ordered.find((season) => {
    const start = dateOnly(season.startDate);
    const end = dateOnly(season.endDate);
    return start <= today && today <= end;
  });

  if (inSeason) {
    return {
      phase: "inSeason",
      referenceDate: today,
      previousDate,
      rosterSeasonId: inSeason.id,
      playerDaySeasonId: inSeason.id,
      targetTeamSeasonId: inSeason.id,
      seasonEndDate: dateOnly(inSeason.endDate),
      draftDate: draftDate(inSeason),
    };
  }

  const concluded = ordered
    .filter((season) => dateOnly(season.endDate) < today)
    .at(-1);
  const upcoming = ordered.find((season) => dateOnly(season.startDate) > today);

  if (
    concluded &&
    dateOnly(concluded.signingEndDate) &&
    today <= dateOnly(concluded.signingEndDate)
  ) {
    return {
      phase: "signingPeriod",
      referenceDate: today,
      previousDate,
      rosterSeasonId: concluded.id,
      playerDaySeasonId: concluded.id,
      targetTeamSeasonId: concluded.id,
      seasonEndDate: dateOnly(concluded.endDate),
      draftDate: draftDate(upcoming ?? concluded),
    };
  }

  if (!upcoming) {
    throw new Error(
      `[player-bio-sync] No upcoming GSHL season is configured after ${today}; roster assignments were not changed.`,
    );
  }

  const upcomingDraftDate = draftDate(upcoming);
  const phase =
    upcomingDraftDate && today >= upcomingDraftDate
      ? "postDraft"
      : "offseasonContracts";
  return {
    phase,
    referenceDate: today,
    previousDate,
    rosterSeasonId: upcoming.id,
    playerDaySeasonId: "",
    targetTeamSeasonId: upcoming.id,
    seasonEndDate: dateOnly(upcoming.endDate),
    draftDate: upcomingDraftDate,
  };
}

function normalizedContractTypes(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map((entry) => toText(entry).toUpperCase()).filter(Boolean);
}

function isPlayingContract(contract: RosterContract): boolean {
  const status = toText(contract.expiryStatus).toUpperCase();
  if (["BUYOUT", "RETIRED", "INJURED"].includes(status)) return false;
  return normalizedContractTypes(contract.contractType).some((type) =>
    ["STANDARD", "EXTENSION"].includes(type),
  );
}

function contractCoversSeason(
  contract: RosterContract,
  targetSeason: RosterSeason,
  seasons: readonly RosterSeason[],
): boolean {
  const seasonStart = dateOnly(targetSeason.startDate);
  const seasonEnd = dateOnly(targetSeason.endDate);
  const contractStart = dateOnly(contract.startDate);
  const contractEnd = dateOnly(
    toText(contract.capHitEndDate) || contract.expiryDate,
  );
  if (seasonStart && seasonEnd && contractStart && contractEnd) {
    return contractStart <= seasonEnd && contractEnd >= seasonStart;
  }

  const ordered = orderSeasons(seasons);
  const signingIndex = ordered.findIndex(
    (season) => season.id === toText(contract.seasonId),
  );
  const length = Number(toText(contract.contractLength));
  if (signingIndex < 0 || !Number.isInteger(length) || length < 1) {
    return false;
  }
  return ordered
    .slice(signingIndex + 1, signingIndex + 1 + length)
    .some((season) => season.id === targetSeason.id);
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && toText(value) !== "";
}

function latestApplicableContracts(
  contracts: readonly RosterContract[],
  targetSeason: RosterSeason,
  seasons: readonly RosterSeason[],
): RosterContract[] {
  const seasonOrder = new Map(
    orderSeasons(seasons).map((season, index) => [season.id, index]),
  );
  const byPlayer = new Map<string, RosterContract[]>();
  for (const contract of contracts) {
    if (
      !isPlayingContract(contract) ||
      !contractCoversSeason(contract, targetSeason, seasons)
    ) {
      continue;
    }
    const playerId = toText(contract.playerId);
    if (!playerId) continue;
    const playerContracts = byPlayer.get(playerId) ?? [];
    playerContracts.push(contract);
    byPlayer.set(playerId, playerContracts);
  }

  return [...byPlayer.values()].map(
    (playerContracts) =>
      [...playerContracts].sort((left, right) => {
        const signingDateDelta = dateOnly(right.signingDate).localeCompare(
          dateOnly(left.signingDate),
        );
        if (signingDateDelta) return signingDateDelta;
        const seasonDelta =
          (seasonOrder.get(toText(right.seasonId)) ?? -1) -
          (seasonOrder.get(toText(left.seasonId)) ?? -1);
        if (seasonDelta) return seasonDelta;
        return toText(right.id).localeCompare(toText(left.id));
      })[0]!,
  );
}

export function reconcileCurrentRoster(options: {
  calendar: RosterCalendar;
  source: RosterSource;
  players: readonly RosterPlayer[];
  seasons: readonly RosterSeason[];
  contracts: readonly RosterContract[];
  teams: readonly RosterTeam[];
  franchises: readonly RosterFranchise[];
  draftPicks: readonly RosterDraftPick[];
}): RosterReconciliation {
  const {
    calendar,
    source,
    players,
    seasons,
    contracts,
    teams,
    franchises,
    draftPicks,
  } = options;
  const issues: RosterIssue[] = [];
  const assignments = new Map<string, { ownerId: string; teamId: string }>();
  const assignmentSources = new Map<string, Set<string>>();
  const playerById = new Map(players.map((player) => [player.id, player]));

  const assign = (
    playerId: string,
    ownerId: string,
    teamId: string,
    assignmentSource: string,
  ) => {
    if (!playerId || !ownerId || !teamId) return;
    if (!playerById.has(playerId)) {
      issues.push({
        kind: "unknownPlayer",
        playerId,
        ownerIds: [ownerId],
        teamIds: [teamId],
        detail: `${assignmentSource} references a player absent from the Player table.`,
      });
      return;
    }
    const existing = assignments.get(playerId);
    if (existing && existing.ownerId !== ownerId) {
      issues.push({
        kind: "conflictingPlayerOwner",
        playerId,
        ownerIds: [existing.ownerId, ownerId].sort(),
        teamIds: [existing.teamId, teamId].sort(),
        detail: `The roster sources assign this player to multiple owners (${assignmentSource}).`,
      });
      return;
    }
    if (existing && existing.teamId !== teamId) {
      issues.push({
        kind: "conflictingLineupTeam",
        playerId,
        ownerIds: [ownerId],
        teamIds: [existing.teamId, teamId].sort(),
        detail: `Owner ${ownerId} resolves to multiple lineup teams (${assignmentSource}).`,
      });
      return;
    }
    assignments.set(playerId, { ownerId, teamId });
    const sources = assignmentSources.get(playerId) ?? new Set<string>();
    sources.add(assignmentSource);
    assignmentSources.set(playerId, sources);
  };

  const targetSeason = seasons.find(
    (season) => season.id === calendar.targetTeamSeasonId,
  );
  if (!targetSeason) {
    throw new Error(
      `[player-bio-sync] Roster target season ${calendar.targetTeamSeasonId} is unavailable.`,
    );
  }
  const targetTeams = teams.filter(
    (team) => toText(team.seasonId) === calendar.targetTeamSeasonId,
  );
  const targetTeamIds = new Set(targetTeams.map((team) => team.id));
  const franchiseById = new Map(
    franchises.map((franchise) => [franchise.id, franchise]),
  );
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const ownerIdForTeam = (teamId: string) =>
    toText(
      franchiseById.get(toText(teamById.get(teamId)?.franchiseId))?.ownerId,
    );

  for (const row of source.playerDays) {
    const playerId = toText(row.playerId);
    const teamId = toText(row.gshlTeamId);
    const ownerId = ownerIdForTeam(teamId);
    if (!teamId || !ownerId) {
      issues.push({
        kind: "invalidPlayerDayTeam",
        playerId,
        ownerIds: ownerId ? [ownerId] : [],
        teamIds: teamId ? [teamId] : [],
        detail: `PlayerDay ${source.date} does not resolve through Team -> Franchise -> Owner.`,
      });
      continue;
    }
    assign(playerId, ownerId, teamId, "playerDay");
  }

  const teamIdsByOwner = new Map<string, string[]>();
  for (const team of targetTeams) {
    const ownerId = toText(
      franchiseById.get(toText(team.franchiseId))?.ownerId,
    );
    if (!ownerId) continue;
    const ownerTeams = teamIdsByOwner.get(ownerId) ?? [];
    ownerTeams.push(team.id);
    teamIdsByOwner.set(ownerId, ownerTeams);
  }

  if (
    source.kind === "offseasonContracts" ||
    source.kind === "postDraftContractsAndPicks"
  ) {
    for (const contract of latestApplicableContracts(
      contracts,
      targetSeason,
      seasons,
    )) {
      const playerId = toText(contract.playerId);
      const ownerId = toText(contract.ownerId);
      const ownerTeamIds = teamIdsByOwner.get(ownerId) ?? [];
      if (ownerTeamIds.length === 0) {
        issues.push({
          kind: "missingContractTeam",
          playerId,
          ownerIds: ownerId ? [ownerId] : [],
          teamIds: [],
          detail: `Playing contract ${toText(contract.id)} belongs to owner ${ownerId}, which has no team in season ${targetSeason.id}.`,
        });
        continue;
      }
      if (ownerTeamIds.length > 1) {
        issues.push({
          kind: "ambiguousOwnerTeam",
          playerId,
          ownerIds: [ownerId],
          teamIds: [...ownerTeamIds].sort(),
          detail: `Owner ${ownerId} has multiple teams in season ${targetSeason.id}.`,
        });
        continue;
      }
      assign(playerId, ownerId, ownerTeamIds[0]!, "contract");
    }
  }

  if (source.kind === "postDraftContractsAndPicks") {
    for (const pick of draftPicks) {
      if (toText(pick.seasonId) !== calendar.targetTeamSeasonId) continue;
      const playerId = toText(pick.playerId);
      const teamId = toText(pick.gshlTeamId);
      if (!playerId) continue;
      if (!teamId || !targetTeamIds.has(teamId)) {
        issues.push({
          kind: "invalidDraftTeam",
          playerId,
          ownerIds: [],
          teamIds: teamId ? [teamId] : [],
          detail: `Assigned draft pick ${toText(pick.id)} does not reference a team in season ${targetSeason.id}.`,
        });
        continue;
      }
      const ownerId = ownerIdForTeam(teamId);
      if (!ownerId) {
        issues.push({
          kind: "invalidDraftTeam",
          playerId,
          ownerIds: [],
          teamIds: [teamId],
          detail: `Assigned draft pick ${toText(pick.id)} does not resolve through Team -> Franchise -> Owner.`,
        });
        continue;
      }
      assign(playerId, ownerId, teamId, "draftPick");
    }
  }

  const updates: RosterReconciliation["updates"] = [];
  const updateReviews: RosterUpdateReview[] = [];
  let assignedPlayers = 0;
  let clearedPlayers = 0;
  let changedOwners = 0;
  let legacyTeamIdsCleared = 0;
  let unchangedPlayers = 0;

  for (const player of players) {
    const previousOwnerId = toText(player.ownerId);
    const previousLegacyTeamId = toText(player.gshlTeamId);
    const assignment = assignments.get(player.id);
    const nextOwnerId = assignment?.ownerId ?? "";
    const data: Record<string, unknown> = {};
    if (previousOwnerId !== nextOwnerId) {
      data.ownerId = nextOwnerId || null;
      if (previousOwnerId && nextOwnerId) changedOwners += 1;
      else if (nextOwnerId) assignedPlayers += 1;
      else clearedPlayers += 1;
    }
    if (previousLegacyTeamId) {
      data.gshlTeamId = null;
      legacyTeamIdsCleared += 1;
    }
    const clearLineupPos = !nextOwnerId && hasValue(player.lineupPos);
    if (clearLineupPos) data.lineupPos = null;
    if (Object.keys(data).length === 0) {
      unchangedPlayers += 1;
      continue;
    }
    updates.push({ id: player.id, data });
    updateReviews.push({
      playerId: player.id,
      fullName: toText(player.fullName),
      previousOwnerId,
      nextOwnerId,
      previousLegacyTeamId,
      legacyTeamIdCleared: Boolean(previousLegacyTeamId),
      clearedLineupPos: clearLineupPos,
    });
  }

  const countSource = (value: string) =>
    [...assignmentSources.values()].filter((sources) => sources.has(value))
      .length;

  return {
    source: source.kind,
    sourceDate: source.date,
    rosterSeasonId: calendar.rosterSeasonId,
    targetTeamSeasonId: calendar.targetTeamSeasonId,
    rosteredPlayers: assignments.size,
    playerDayAssignments: countSource("playerDay"),
    contractAssignments: countSource("contract"),
    draftPickAssignments: countSource("draftPick"),
    assignedPlayers,
    clearedPlayers,
    changedOwners,
    legacyTeamIdsCleared,
    unchangedPlayers,
    assignments: [...assignments.entries()]
      .map(([playerId, assignment]) => ({ playerId, ...assignment }))
      .sort(
        (left, right) =>
          left.teamId.localeCompare(right.teamId) ||
          left.playerId.localeCompare(right.playerId),
      ),
    updates,
    updateReviews,
    issues,
  };
}

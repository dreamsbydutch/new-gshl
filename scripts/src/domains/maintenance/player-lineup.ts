import type { RosterPlayer } from "./player-roster";

export type LineupPlayer = RosterPlayer & {
  nhlPos?: unknown;
  posGroup?: unknown;
  seasonRating?: unknown;
};

export type RosterAssignment = {
  playerId: string;
  ownerId: string;
  teamId: string;
};

export type LineupUpdateReview = {
  playerId: string;
  fullName: string;
  teamId: string;
  seasonRating: number;
  previousLineupPos: string;
  nextLineupPos: string;
};

export type TeamLineupSummary = {
  teamId: string;
  rosterPlayers: number;
  starters: number;
  benchPlayers: number;
};

export type LineupReconciliation = {
  rosteredPlayers: number;
  starters: number;
  benchPlayers: number;
  clearedUnrosteredPlayers: number;
  updatedPlayers: number;
  unchangedPlayers: number;
  updates: Array<{ id: string; data: { lineupPos: string | null } }>;
  updateReviews: LineupUpdateReview[];
  teams: TeamLineupSummary[];
};

type OptimizerPlayer = {
  playerId: string;
  nhlPos: string[];
  posGroup: string;
  Rating: number;
};

type FindBestLineup = (
  players: Array<Record<string, unknown>>,
) => Record<string, string>;

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

function toRating(value: unknown): number {
  const parsed = Number(toText(value).replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePositions(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const positions = new Set<string>();
  for (const entry of values) {
    if (entry === null || entry === undefined) continue;
    let entries: unknown[] = [entry];
    if (typeof entry === "string" && entry.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(entry) as unknown;
        if (Array.isArray(parsed)) entries = parsed;
      } catch {
        entries = [entry];
      }
    }
    for (const candidate of entries) {
      for (const position of toText(candidate).split(/[,/|;]+/)) {
        const normalized = position
          .replace(/^[\[\s'"]+|[\]\s'"]+$/g, "")
          .trim()
          .toUpperCase();
        if (normalized) positions.add(normalized);
      }
    }
  }
  return [...positions];
}

function optimizerPlayer(player: LineupPlayer): OptimizerPlayer {
  return {
    playerId: player.id,
    nhlPos: normalizePositions(player.nhlPos),
    posGroup: toText(player.posGroup).toUpperCase(),
    Rating: toRating(player.seasonRating),
  };
}

export function reconcileRosterLineups(options: {
  players: readonly LineupPlayer[];
  rosterAssignments: readonly RosterAssignment[];
  findBestLineup: FindBestLineup;
}): LineupReconciliation {
  const { players, rosterAssignments, findBestLineup } = options;
  const playerById = new Map(players.map((player) => [player.id, player]));
  const rosterTeamByPlayerId = new Map(
    rosterAssignments.map((assignment) => [
      assignment.playerId,
      assignment.teamId,
    ]),
  );
  const playerIdsByTeam = new Map<string, string[]>();
  for (const assignment of rosterAssignments) {
    if (!playerById.has(assignment.playerId)) {
      throw new Error(
        `[player-bio-sync] Lineup roster references unknown player ${assignment.playerId}.`,
      );
    }
    const playerIds = playerIdsByTeam.get(assignment.teamId) ?? [];
    playerIds.push(assignment.playerId);
    playerIdsByTeam.set(assignment.teamId, playerIds);
  }

  const expectedLineupPos = new Map<string, string>();
  const teams: TeamLineupSummary[] = [];
  for (const [teamId, playerIds] of [...playerIdsByTeam.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const rosterPlayers = playerIds
      .map((playerId) => playerById.get(playerId))
      .filter((player): player is LineupPlayer => Boolean(player))
      .sort((left, right) => left.id.localeCompare(right.id));
    const assignments = findBestLineup(
      rosterPlayers.map(optimizerPlayer) as Array<Record<string, unknown>>,
    );
    const rosterPlayerIds = new Set(playerIds);
    for (const assignedPlayerId of Object.keys(assignments)) {
      if (!rosterPlayerIds.has(assignedPlayerId)) {
        throw new Error(
          `[player-bio-sync] Lineup optimizer assigned non-roster player ${assignedPlayerId} to ${teamId}.`,
        );
      }
    }

    let starters = 0;
    for (const player of rosterPlayers) {
      const lineupPos = toText(assignments[player.id]) || "BN";
      expectedLineupPos.set(player.id, lineupPos);
      if (lineupPos !== "BN") starters += 1;
    }
    teams.push({
      teamId,
      rosterPlayers: rosterPlayers.length,
      starters,
      benchPlayers: rosterPlayers.length - starters,
    });
  }

  const updates: LineupReconciliation["updates"] = [];
  const updateReviews: LineupUpdateReview[] = [];
  let clearedUnrosteredPlayers = 0;
  let unchangedPlayers = 0;

  for (const player of players) {
    const teamId = rosterTeamByPlayerId.get(player.id) ?? "";
    const previousLineupPos = toText(player.lineupPos);
    const nextLineupPos = expectedLineupPos.get(player.id) ?? "";
    if (previousLineupPos === nextLineupPos) {
      unchangedPlayers += 1;
      continue;
    }
    if (!teamId && previousLineupPos) clearedUnrosteredPlayers += 1;
    updates.push({
      id: player.id,
      data: { lineupPos: nextLineupPos || null },
    });
    updateReviews.push({
      playerId: player.id,
      fullName: toText(player.fullName),
      teamId,
      seasonRating: toRating(player.seasonRating),
      previousLineupPos,
      nextLineupPos,
    });
  }

  return {
    rosteredPlayers: rosterAssignments.length,
    starters: teams.reduce((total, team) => total + team.starters, 0),
    benchPlayers: teams.reduce((total, team) => total + team.benchPlayers, 0),
    clearedUnrosteredPlayers,
    updatedPlayers: updates.length,
    unchangedPlayers,
    updates,
    updateReviews,
    teams,
  };
}

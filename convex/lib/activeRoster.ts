import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { utcTimestampToDateKey } from "./timestamps";
import { toLineupCandidate } from "./teamLineup";
import { generateLineupAssignments } from "../../src/lib/utils/features/draft-admin";
import { ContractType } from "../../src/lib/utils/domain/constants";

const MAX_ROWS = 4000;
function bounded<T>(rows: T[]): T[] {
  if (rows.length > MAX_ROWS)
    throw new Error("Roster refresh source exceeds its safe row limit");
  return rows;
}

export function selectRosterSeason(seasons: Doc<"seasons">[], today: string) {
  const dated = seasons
    .filter(
      (s) => s.startDate != null && s.endDate != null && s.legacyId !== "0",
    )
    .sort((a, b) => Number(a.startDate) - Number(b.startDate));
  const season =
    dated.find(
      (s) =>
        utcTimestampToDateKey(s.startDate)! <= today &&
        utcTimestampToDateKey(s.endDate)! >= today,
    ) ??
    dated.find((s) => utcTimestampToDateKey(s.startDate)! > today) ??
    dated.at(-1);
  if (!season)
    throw new Error("No current or upcoming roster season is configured");
  return season;
}

export function rosterSource(
  season: Doc<"seasons">,
  picks: Doc<"draftPicks">[],
  today: string,
) {
  const start = utcTimestampToDateKey(season.startDate)!;
  const end = utcTimestampToDateKey(season.endDate)!;
  if (start <= today && today <= end) return "player-days";
  if (today < start) {
    const draftPicks = picks.filter((p) => !p.isSigning);
    if (draftPicks.length && draftPicks.every((p) => p.playerId))
      return "draft-picks";
    if (draftPicks.some((p) => p.playerId)) {
      throw new Error(
        "The upcoming draft is incomplete; finish it before refreshing rosters",
      );
    }
  }
  return "contracts";
}

/** Signed future contracts count immediately, as they do in the signing workflow. */
export function activeRosterContract(
  contract: Doc<"contracts">,
  today: string,
) {
  if (
    contract.contractType !== ContractType.STANDARD &&
    contract.contractType !== ContractType.EXTENSION
  )
    return false;
  if (
    ["Buyout", "Retired", "Injured", "Trade"].includes(
      contract.expiryStatus ?? "",
    )
  )
    return false;
  const signed = utcTimestampToDateKey(
    contract.signingDate ?? contract.startDate,
  );
  const expires = utcTimestampToDateKey(contract.expiryDate);
  return (
    signed !== null && expires !== null && signed <= today && today <= expires
  );
}

type Membership = { playerId: Id<"players">; teamId: Id<"teams"> };

/** Build the complete replacement before writing, including free-agent cleanup. */
export function planActiveRoster(
  players: Doc<"players">[],
  teams: { teamId: Id<"teams">; ownerId: Id<"owners"> }[],
  memberships: Membership[],
) {
  const teamById = new Map(teams.map((t) => [t.teamId, t]));
  const playerById = new Map(players.map((p) => [p._id, p]));
  const assigned = new Map<Id<"players">, Id<"teams">>();
  for (const member of memberships) {
    if (!teamById.has(member.teamId) || !playerById.has(member.playerId)) {
      throw new Error(
        "Roster source refers to a missing player or a team outside the current season",
      );
    }
    const previous = assigned.get(member.playerId);
    if (previous && previous !== member.teamId)
      throw new Error(`Conflicting teams for player ${member.playerId}`);
    assigned.set(member.playerId, member.teamId);
  }
  const positions = new Map<string, string>();
  for (const team of teams) {
    const roster = players.filter((p) => assigned.get(p._id) === team.teamId);
    for (const assignment of generateLineupAssignments(
      roster.map(toLineupCandidate),
    )) {
      positions.set(assignment.playerId, assignment.lineupPos);
    }
  }
  return players.flatMap((player) => {
    const teamId = assigned.get(player._id) ?? null;
    const ownerId = teamId ? teamById.get(teamId)!.ownerId : null;
    const lineupPos = positions.get(player._id) ?? null;
    if (
      (player.gshlTeamId ?? null) === teamId &&
      (player.ownerId ?? null) === ownerId &&
      (player.lineupPos ?? null) === lineupPos
    )
      return [];
    return [{ playerId: player._id, gshlTeamId: teamId, ownerId, lineupPos }];
  });
}

/** Atomic reconciliation: source validation and optimization precede all player writes. */
export async function refreshActiveRoster(
  ctx: MutationCtx,
  request: { apply: boolean; seasonId?: string; now: number },
) {
  const today = utcTimestampToDateKey(request.now)!;
  const seasons = bounded(await ctx.db.query("seasons").take(MAX_ROWS + 1));
  const season = selectRosterSeason(seasons, today);
  if (
    request.seasonId &&
    request.seasonId !== season._id &&
    request.seasonId !== season.legacyId
  ) {
    throw new Error(
      "Active roster refresh only supports the current roster season",
    );
  }
  const [teams, picks, players] = await Promise.all([
    ctx.db
      .query("teams")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .take(MAX_ROWS + 1)
      .then(bounded),
    ctx.db
      .query("draftPicks")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .take(MAX_ROWS + 1)
      .then(bounded),
    ctx.db
      .query("players")
      .take(MAX_ROWS + 1)
      .then(bounded),
  ]);
  if (!teams.length)
    throw new Error("No teams configured for the current roster season");
  const rosterTeams = await Promise.all(
    teams.map(async (team) => {
      const franchise = await ctx.db.get(team.franchiseId);
      if (!franchise || !(await ctx.db.get(franchise.ownerId)))
        throw new Error("Team has no valid franchise owner");
      return { teamId: team._id, ownerId: franchise.ownerId };
    }),
  );
  if (new Set(rosterTeams.map((t) => t.ownerId)).size !== rosterTeams.length) {
    throw new Error("Multiple current teams belong to the same owner");
  }
  const source = rosterSource(season, picks, today);
  let sourceDate: string | null = null;
  let memberships: Membership[];
  if (source === "player-days") {
    const latest = await ctx.db
      .query("playerDayStatLines")
      .withIndex("by_seasonId_date", (q) =>
        q.eq("seasonId", season._id).lte("date", today),
      )
      .order("desc")
      .first();
    if (!latest?.date)
      throw new Error("No player-day snapshot exists for the current season");
    sourceDate = latest.date;
    const days = bounded(
      await ctx.db
        .query("playerDayStatLines")
        .withIndex("by_seasonId_date", (q) =>
          q.eq("seasonId", season._id).eq("date", latest.date),
        )
        .take(MAX_ROWS + 1),
    );
    memberships = days.map((day) => ({
      playerId: day.playerId,
      teamId: day.gshlTeamId,
    }));
    if (teams.some((team) => !memberships.some((m) => m.teamId === team._id))) {
      throw new Error(
        "Latest player-day snapshot is missing teams; complete the import before refreshing rosters",
      );
    }
  } else if (source === "draft-picks") {
    memberships = picks.flatMap((pick) => {
      if (!pick.playerId) return [];
      if (!pick.gshlTeamId)
        throw new Error("An assigned draft pick has no team");
      return [{ playerId: pick.playerId, teamId: pick.gshlTeamId }];
    });
  } else {
    const contracts = await Promise.all(
      rosterTeams.map(async (team) => {
        const rows = bounded(
          await ctx.db
            .query("contracts")
            .withIndex("by_ownerId", (q) => q.eq("ownerId", team.ownerId))
            .take(MAX_ROWS + 1),
        );
        return rows
          .filter((c) => activeRosterContract(c, today))
          .map((c) => ({ playerId: c.playerId, teamId: team.teamId }));
      }),
    );
    memberships = contracts.flat();
  }
  const changes = planActiveRoster(players, rosterTeams, memberships);
  if (request.apply) {
    for (const { playerId, ...patch } of changes)
      await ctx.db.patch(playerId, { ...patch, updatedAt: request.now });
  }
  return {
    seasonId: season._id,
    source,
    sourceDate,
    teams: teams.length,
    assigned: new Set(memberships.map((m) => m.playerId)).size,
    processed: players.length,
    updated: changes.length,
    unchanged: players.length - changes.length,
  };
}

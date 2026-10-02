import { normalizeDateOnlyValue } from "../../utils/date";
import {
  reconcileRosterLineups,
  type LineupPlayer,
} from "../maintenance/player-lineup";
import type { RosterMetadata } from "./daily-roster";

type Row = Record<string, unknown> & { id: string };
type Patch = { id: string; data: Record<string, unknown> };
const text = (value: unknown) => String(value ?? "").trim();
const day = (value: unknown) => normalizeDateOnlyValue(value) ?? "";

/** Only a complete, identity-checked current-day capture may call this planner. */
export function planDailyRosterMaintenance(input: {
  date: string;
  today: string;
  seasonId: string;
  seasons: Row[];
  teams: Row[];
  franchises: Row[];
  players: LineupPlayer[];
  contracts: Row[];
  days: RosterMetadata[];
  findBestLineup: Parameters<
    typeof reconcileRosterLineups
  >[0]["findBestLineup"];
}) {
  if (input.date !== input.today)
    throw new Error(
      "Current rosters and buyouts can only be reconciled for today in America/Toronto.",
    );
  const season = input.seasons.find((row) => row.id === input.seasonId);
  if (!season) throw new Error("Roster season is missing.");
  const ownerByTeam = new Map<string, string>();
  for (const team of input.teams) {
    const owner = text(
      input.franchises.find((f) => f.id === team.franchiseId)?.ownerId,
    );
    if (
      team.seasonId !== input.seasonId ||
      !owner ||
      [...ownerByTeam.values()].includes(owner)
    )
      throw new Error(
        "Each season team must resolve to a different franchise owner.",
      );
    ownerByTeam.set(team.id, owner);
  }
  if (
    !ownerByTeam.size ||
    input.teams.some(
      (team) => !input.days.some((d) => d.gshlTeamId === team.id),
    )
  )
    throw new Error(
      "Complete Yahoo roster coverage is required for every team.",
    );
  const playersById = new Map(input.players.map((p) => [p.id, p]));
  const daysByPlayer = new Map<string, RosterMetadata>();
  for (const row of input.days) {
    if (
      row.date !== input.date ||
      row.seasonId !== input.seasonId ||
      !ownerByTeam.has(row.gshlTeamId) ||
      !playersById.has(row.playerId) ||
      daysByPlayer.has(row.playerId)
    )
      throw new Error(
        "Roster capture contains duplicate, unknown, or out-of-scope assignments.",
      );
    daysByPlayer.set(row.playerId, row);
  }
  const assignments = input.days.map((row) => ({
    playerId: row.playerId,
    teamId: row.gshlTeamId,
    ownerId: ownerByTeam.get(row.gshlTeamId)!,
  }));
  const eligiblePlayers = input.players.map((player) => {
    const row = daysByPlayer.get(player.id);
    return row
      ? { ...player, nhlPos: row.nhlPos, posGroup: row.posGroup }
      : player;
  });
  const lineup = reconcileRosterLineups({
    players: eligiblePlayers,
    rosterAssignments: assignments,
    findBestLineup: input.findBestLineup,
  });
  const patches = new Map<string, Record<string, unknown>>();
  const rosterReviews = [];
  for (const player of input.players) {
    const row = daysByPlayer.get(player.id);
    const ownerId = row ? ownerByTeam.get(row.gshlTeamId)! : null;
    const data: Record<string, unknown> = {};
    if ((player.ownerId ?? null) !== ownerId) data.ownerId = ownerId;
    if ((player.gshlTeamId ?? null) !== (row?.gshlTeamId ?? null))
      data.gshlTeamId = row?.gshlTeamId ?? null;
    if (row) {
      if (JSON.stringify(player.nhlPos) !== JSON.stringify(row.nhlPos))
        data.nhlPos = [...row.nhlPos];
      if (player.posGroup !== row.posGroup) data.posGroup = row.posGroup;
    }
    if (Object.keys(data).length) {
      patches.set(player.id, data);
      rosterReviews.push({
        playerId: player.id,
        name: text(player.fullName),
        previousOwnerId: player.ownerId ?? null,
        ownerId,
        teamId: row?.gshlTeamId ?? null,
      });
    }
  }
  for (const update of lineup.updates)
    patches.set(update.id, { ...patches.get(update.id), ...update.data });

  const buyouts: Array<
    Patch & {
      playerId: string;
      name: string;
      ownerId: string;
      previous: Record<string, unknown>;
    }
  > = [];
  const conflicts: string[] = [];
  const owners = new Set(ownerByTeam.values());
  const active = input.contracts.filter(
    (c) =>
      owners.has(text(c.ownerId)) &&
      ["STANDARD", "EXTENSION"].includes(text(c.contractType).toUpperCase()) &&
      !["BUYOUT", "TRADE", "RETIRED", "INJURED"].includes(
        text(c.expiryStatus).toUpperCase(),
      ) &&
      day(c.signingDate ?? c.startDate) <= input.date &&
      day(c.expiryDate) >= input.date,
  );
  for (const contract of active) {
    const playerId = text(contract.playerId);
    const row = daysByPlayer.get(playerId);
    if (row) {
      if (ownerByTeam.get(row.gshlTeamId) !== contract.ownerId)
        conflicts.push(
          `Contract ${contract.id}: player is rostered by another owner; reconcile the trade or drop transaction before applying.`,
        );
      continue;
    }
    if (
      !playersById.has(playerId) ||
      !day(contract.signingDate ?? contract.startDate) ||
      active.filter((c) => c.playerId === playerId).length !== 1
    ) {
      conflicts.push(
        `Contract ${contract.id}: missing player/date or overlapping playing contracts require review.`,
      );
      continue;
    }
    const salary = Number(contract.contractSalary);
    if (
      contract.contractSalary == null ||
      contract.contractSalary === "" ||
      !Number.isFinite(salary) ||
      salary < 0
    ) {
      conflicts.push(`Contract ${contract.id}: invalid salary.`);
      continue;
    }
    // Contract years follow GSHL seasons; legacy contracts can end in May.
    const finalYear =
      Number(day(contract.expiryDate).slice(0, 4)) <= Number(season.year);
    const nextSeason = input.seasons.find(
      (s) => Number(s.year) === Number(season.year) + 1,
    );
    const capHitEndDate = finalYear
      ? day(nextSeason?.endDate)
      : day(contract.capHitEndDate ?? contract.expiryDate);
    if (!capHitEndDate || capHitEndDate < input.date) {
      conflicts.push(
        `Contract ${contract.id}: a configured cap-charge end date is required.`,
      );
      continue;
    }
    buyouts.push({
      id: contract.id,
      playerId,
      name: text(playersById.get(playerId)?.fullName),
      ownerId: text(contract.ownerId),
      previous: {
        expiryStatus: contract.expiryStatus,
        expiryDate: contract.expiryDate,
        capHit: contract.capHit,
        capHitEndDate: contract.capHitEndDate,
      },
      data: {
        expiryStatus: "Buyout",
        expiryDate: input.date,
        capHit: salary / 2,
        capHitEndDate,
      },
    });
  }
  return {
    playerUpdates: [...patches].map(([id, data]) => ({ id, data })),
    rosterReviews,
    lineupTeams: lineup.teams,
    buyouts,
    conflicts,
  };
}

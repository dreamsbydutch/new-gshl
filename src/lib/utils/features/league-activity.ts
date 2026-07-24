import type {
  Contract,
  ContractStatus as ContractStatusType,
  Franchise,
  LeagueActivityEvent,
  LeagueActivityType,
  Player,
  PlayerDayStatLine,
  Team,
} from "@gshl-types";
import { ContractStatus } from "../domain/constants";
import { normalizeDateOnlyValue } from "../core/date";
import { toNumber } from "../core/data";

type ContractSource = Pick<
  Contract,
  | "id"
  | "playerId"
  | "ownerId"
  | "seasonId"
  | "signingDate"
  | "signingStatus"
  | "contractLength"
  | "contractSalary"
>;
type PlayerDaySource = Pick<
  PlayerDayStatLine,
  "id" | "playerId" | "gshlTeamId" | "date" | "ADD" | "MS"
>;
type PlayerSource = Pick<Player, "id" | "fullName">;
type TeamSource = Pick<Team, "id" | "seasonId" | "franchiseId">;
type FranchiseSource = Pick<
  Franchise,
  "id" | "ownerId" | "name" | "abbr" | "logoUrl"
>;

interface BuildLeagueActivityOptions {
  contracts: ContractSource[];
  playerDays: PlayerDaySource[];
  players: PlayerSource[];
  teams: TeamSource[];
  franchises: FranchiseSource[];
  limit?: number;
}

const SIGNING_STATUSES = new Set<ContractStatusType>([
  ContractStatus.DRAFTED,
  ContractStatus.RFA,
  ContractStatus.UFA,
]);

const TYPE_PRIORITY: Record<LeagueActivityType, number> = {
  signing: 0,
  add: 1,
  drop: 2,
  missed_start: 3,
};

function previousCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function buildLeagueActivity({
  contracts,
  playerDays,
  players,
  teams,
  franchises,
  limit = 12,
}: BuildLeagueActivityOptions): LeagueActivityEvent[] {
  const playerById = new Map(
    players.map((player) => [String(player.id), player]),
  );
  const franchiseById = new Map(
    franchises.map((franchise) => [String(franchise.id), franchise]),
  );
  const franchiseByOwnerId = new Map(
    franchises.map((franchise) => [String(franchise.ownerId), franchise]),
  );
  const teamById = new Map(teams.map((team) => [String(team.id), team]));

  const playerName = (playerId: string) =>
    playerById.get(String(playerId))?.fullName ?? "Unknown player";
  const teamDetails = (team?: TeamSource, franchise?: FranchiseSource) => {
    const resolvedFranchise =
      franchise ??
      (team ? franchiseById.get(String(team.franchiseId)) : undefined);
    return {
      teamId: team ? String(team.id) : null,
      teamName: resolvedFranchise?.name ?? "Unknown team",
      teamAbbr: resolvedFranchise?.abbr ?? null,
      teamLogoUrl: resolvedFranchise?.logoUrl ?? null,
    };
  };

  const events: LeagueActivityEvent[] = [];
  const seen = new Set<string>();
  const push = (event: LeagueActivityEvent) => {
    const key = `${event.type}:${event.date}:${event.teamId ?? "none"}:${event.playerId}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(event);
  };

  contracts.forEach((contract) => {
    const date = normalizeDateOnlyValue(contract.signingDate);
    if (!date || !SIGNING_STATUSES.has(contract.signingStatus)) return;

    const franchise = franchiseByOwnerId.get(String(contract.ownerId));
    const team = teams.find(
      (candidate) =>
        String(candidate.seasonId) === String(contract.seasonId) &&
        String(candidate.franchiseId) === String(franchise?.id ?? ""),
    );
    push({
      id: `signing:${contract.id}`,
      type: "signing",
      date,
      playerId: String(contract.playerId),
      playerName: playerName(String(contract.playerId)),
      ...teamDetails(team, franchise),
      signingStatus: String(contract.signingStatus),
      contractLength: contract.contractLength,
      contractSalary: contract.contractSalary,
    });
  });

  const rosterByDate = new Map<string, Map<string, Set<string>>>();
  playerDays.forEach((row) => {
    const date = normalizeDateOnlyValue(row.date);
    const teamId = String(row.gshlTeamId ?? "");
    const playerId = String(row.playerId ?? "");
    if (!date || !teamId || !playerId) return;

    const teamsForDate =
      rosterByDate.get(date) ?? new Map<string, Set<string>>();
    const roster = teamsForDate.get(teamId) ?? new Set<string>();
    roster.add(playerId);
    teamsForDate.set(teamId, roster);
    rosterByDate.set(date, teamsForDate);

    const team = teamById.get(teamId);
    if (toNumber(row.ADD, 0) > 0) {
      push({
        id: `add:${row.id}`,
        type: "add",
        date,
        playerId,
        playerName: playerName(playerId),
        ...teamDetails(team),
      });
    }
    if (toNumber(row.MS, 0) > 0) {
      push({
        id: `missed-start:${row.id}`,
        type: "missed_start",
        date,
        playerId,
        playerName: playerName(playerId),
        ...teamDetails(team),
      });
    }
  });

  rosterByDate.forEach((todayTeams, date) => {
    const yesterdayTeams = rosterByDate.get(previousCalendarDate(date));
    if (!yesterdayTeams) return;

    todayTeams.forEach((todayRoster, teamId) => {
      const yesterdayRoster = yesterdayTeams.get(teamId);
      if (!yesterdayRoster) return;

      yesterdayRoster.forEach((playerId) => {
        if (todayRoster.has(playerId)) return;
        push({
          id: `drop:${date}:${teamId}:${playerId}`,
          type: "drop",
          date,
          playerId,
          playerName: playerName(playerId),
          ...teamDetails(teamById.get(teamId)),
        });
      });
    });
  });

  return events
    .sort((left, right) => {
      const dateDelta = right.date.localeCompare(left.date);
      if (dateDelta !== 0) return dateDelta;
      const typeDelta = TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type];
      if (typeDelta !== 0) return typeDelta;
      return left.playerName.localeCompare(right.playerName);
    })
    .slice(0, Math.max(0, limit));
}

import type {
  Contract,
  ContractStatus as ContractStatusType,
  Franchise,
  LeagueActivityEvent,
  LeagueActivityType,
  Player,
  PlayerDayStatLine,
  Team,
  Week,
} from "@gshl-types";
import { ContractStatus } from "../domain/constants";
import { normalizeDateOnlyValue } from "../core/date";
import { toNumber } from "../core/data";
import type { LeagueTradeSummary } from "../../types/trades";

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
  weeks?: Pick<Week, "id" | "startDate" | "endDate">[];
  perTypeLimit?: boolean;
  rosterStartDate?: string;
  trades?: readonly LeagueTradeSummary[];
  limit?: number;
}

const SIGNING_STATUSES = new Set<ContractStatusType>([
  ContractStatus.DRAFTED,
  ContractStatus.RFA,
  ContractStatus.UFA,
]);

const TYPE_PRIORITY: Record<LeagueActivityType, number> = {
  signing: 0,
  trade: 1,
  add: 2,
  drop: 3,
  missed_start: 4,
};

function previousCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

/** Keep each transaction list visible even when another kind is much busier. */
export function limitLeagueActivity(
  events: readonly LeagueActivityEvent[],
  limit: number,
  perType: boolean,
): LeagueActivityEvent[] {
  if (!perType) return events.slice(0, Math.max(0, limit));
  const counts = new Map<LeagueActivityType, number>();
  return events.filter((event) => {
    if (event.type === "missed_start") return false;
    const count = (counts.get(event.type) ?? 0) + 1;
    counts.set(event.type, count);
    return count <= Math.max(0, limit);
  });
}

export function buildLeagueActivity({
  contracts,
  playerDays,
  players,
  teams,
  franchises,
  weeks = [],
  perTypeLimit = false,
  rosterStartDate,
  trades: recordedTrades,
  limit = 12,
}: BuildLeagueActivityOptions): LeagueActivityEvent[] {
  const trades = recordedTrades ?? [];
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
    if (
      rosterStartDate &&
      event.date < rosterStartDate &&
      event.type !== "signing" &&
      event.type !== "trade"
    )
      return;
    const key = event.trade
      ? event.id
      : `${event.type}:${event.date}:${event.teamId ?? "none"}:${event.playerId}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(event);
  };

  for (const trade of trades)
    push({
      id: `trade:${trade.id}`,
      type: "trade",
      date: trade.date,
      playerId: "",
      playerName: `${trade.teamA.name} ↔ ${trade.teamB.name}`,
      teamId: null,
      teamName: "",
      teamAbbr: null,
      teamLogoUrl: null,
      trade,
    });
  contracts.forEach((contract) => {
    const date = normalizeDateOnlyValue(contract.signingDate);
    const isTrade = contract.signingStatus === ContractStatus.TRADE;
    // New grouped feeds have an authoritative ledger; legacy archive snapshots
    // can still display their recorded contract-transfer notices.
    if (isTrade && perTypeLimit && recordedTrades !== undefined) return;
    if (
      isTrade &&
      trades.some(
        (t) =>
          t.date === date &&
          t.players.some((p) => p.playerId === String(contract.playerId)),
      )
    )
      return;
    if (!date || (!SIGNING_STATUSES.has(contract.signingStatus) && !isTrade)) {
      return;
    }

    const team = teams.find(
      (candidate) =>
        String(candidate.seasonId) === String(contract.seasonId) &&
        String(
          franchiseById.get(String(candidate.franchiseId))?.ownerId ?? "",
        ) === String(contract.ownerId),
    );
    const franchise = team
      ? franchiseById.get(String(team.franchiseId))
      : franchiseByOwnerId.get(String(contract.ownerId));
    push({
      id: `signing:${contract.id}`,
      type: isTrade ? "trade" : "signing",
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

  const tradedAdds = new Set<string>();
  const tradedDrops = new Set<string>();
  const dates = [...rosterByDate.keys()].sort();
  const firstDate = dates[0];
  for (const trade of trades)
    for (const player of trade.players) {
      const baseline = firstDate ? rosterByDate.get(firstDate) : undefined;
      // An older transfer that is no longer represented in this read window
      // must not consume a later genuine free-agent pickup.
      if (
        firstDate &&
        trade.date < firstDate &&
        (!baseline?.get(player.fromTeamId)?.has(player.playerId) ||
          baseline.get(player.toTeamId)?.has(player.playerId))
      )
        continue;
      const arrival = dates.find(
        (date) =>
          date >= trade.date &&
          rosterByDate.get(date)?.get(player.toTeamId)?.has(player.playerId),
      );
      if (arrival)
        tradedAdds.add(`${arrival}:${player.toTeamId}:${player.playerId}`);
      const departure = dates.find((date) => {
        if (date < trade.date || (arrival && date > arrival)) return false;
        const current = rosterByDate.get(date)?.get(player.fromTeamId);
        const previous = rosterByDate
          .get(previousCalendarDate(date))
          ?.get(player.fromTeamId);
        return (
          current &&
          !current.has(player.playerId) &&
          previous?.has(player.playerId)
        );
      });
      if (departure)
        tradedDrops.add(`${departure}:${player.fromTeamId}:${player.playerId}`);
    }
  const visibleEvents = events.filter((event) => {
    const key = `${event.date}:${event.teamId}:${event.playerId}`;
    return (
      !(event.type === "add" && tradedAdds.has(key)) &&
      !(event.type === "drop" && tradedDrops.has(key))
    );
  });

  const weekFor = (date: string) =>
    weeks.find((week) => {
      const start = normalizeDateOnlyValue(week.startDate);
      const end = normalizeDateOnlyValue(week.endDate);
      return start && end && date >= start && date <= end;
    });
  const weeklyAdds = new Map<string, number>();
  for (const event of visibleEvents) {
    if (event.type !== "add") continue;
    const week = weekFor(event.date);
    if (!week) continue;
    const key = `${event.teamId}:${week.id}`;
    weeklyAdds.set(key, (weeklyAdds.get(key) ?? 0) + 1);
  }
  for (const event of visibleEvents) {
    if (event.type !== "add") continue;
    const week = weekFor(event.date);
    event.weeklyAddCount = week
      ? (weeklyAdds.get(`${event.teamId}:${week.id}`) ?? null)
      : null;
  }
  return limitLeagueActivity(
    visibleEvents.sort((left, right) => {
      const dateDelta = right.date.localeCompare(left.date);
      if (dateDelta !== 0) return dateDelta;
      const typeDelta = TYPE_PRIORITY[left.type] - TYPE_PRIORITY[right.type];
      if (typeDelta !== 0) return typeDelta;
      return left.playerName.localeCompare(right.playerName);
    }),
    limit,
    perTypeLimit,
  );
}

import type { Contract, Season } from "@gshl-types";
import type {
  OwnerCommandCenterActivityItem,
  OwnerCommandCenterData,
  OwnerCommandCenterMatchup,
  OwnerCommandCenterRosterPlayer,
} from "@gshl-lib/types/owner-command-center";
import { normalizeDateOnlyValue } from "../core/date";
import { toNumber } from "../core/data";
import {
  doesContractAffectSeason,
  getContractCoveredSeasonIds,
} from "../domain/contracts";
import { RosterPosition } from "../domain/constants";
import { calculateContractCapSpaceWindow } from "./contract-table";
import {
  buildLockerRoomNavigationHref,
  buildMatchupNavigationHref,
} from "./contextual-navigation";
import {
  DRAFT_ROSTER_BENCH_SLOTS,
  DRAFT_ROSTER_LINEUP_SLOTS,
} from "./draft-roster-board";

export const OWNER_COMMAND_CENTER_ACTIVITY_KEY =
  "gshl-owner-command-center-activity";

const POSITION_ORDER = [
  RosterPosition.LW,
  RosterPosition.C,
  RosterPosition.RW,
  RosterPosition.D,
  RosterPosition.G,
  RosterPosition.Util,
] as const;

const POSITION_LABELS: Record<string, string> = {
  [RosterPosition.LW]: "LW",
  [RosterPosition.C]: "C",
  [RosterPosition.RW]: "RW",
  [RosterPosition.D]: "D",
  [RosterPosition.G]: "G",
  [RosterPosition.Util]: "Util",
};

const FALLBACK_ROSTER_SPOTS = [
  ...DRAFT_ROSTER_LINEUP_SLOTS.map((slot) => slot.position),
  ...Array.from({ length: DRAFT_ROSTER_BENCH_SLOTS }, () =>
    String(RosterPosition.BN),
  ),
];

function normalizeRosterSpot(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (normalized.toUpperCase() === "UTIL") return RosterPosition.Util;
  if (normalized.toUpperCase() === "IR+") return RosterPosition.IRplus;
  return normalized;
}

function countValues(values: readonly string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

function rosterPositionOrder(player: OwnerCommandCenterRosterPlayer) {
  const position = normalizeRosterSpot(player.lineupPos);
  const index = [
    ...POSITION_ORDER,
    RosterPosition.BN,
    RosterPosition.IR,
    RosterPosition.IRplus,
  ].indexOf(position as never);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function seasonYear(season: { year: number }) {
  const year = Number(season.year);
  return Number.isFinite(year) ? year : Number.NEGATIVE_INFINITY;
}

function matchupResult(matchup: OwnerCommandCenterMatchup, teamId: string) {
  if (matchup.tie === true) return "T" as const;
  const isHome = matchup.homeTeamId === teamId;
  const won = isHome ? matchup.homeWin : matchup.awayWin;
  return won === true ? ("W" as const) : ("L" as const);
}

function matchupScore(matchup: OwnerCommandCenterMatchup, teamId: string) {
  const isHome = matchup.homeTeamId === teamId;
  const teamScore = isHome ? matchup.homeScore : matchup.awayScore;
  const opponentScore = isHome ? matchup.awayScore : matchup.homeScore;
  return teamScore === null || opponentScore === null
    ? null
    : `${teamScore}-${opponentScore}`;
}

function matchupHref(
  matchup: OwnerCommandCenterMatchup,
  data: OwnerCommandCenterData,
  teamId: string,
) {
  return buildMatchupNavigationHref(matchup.id, {
    from: "lockerroom",
    view: "history",
    season: data.season?.id ?? null,
    week: matchup.weekId,
    owner: data.ownerId,
    side: matchup.homeTeamId === teamId ? "home" : "away",
  });
}

function buildRosterView(data: OwnerCommandCenterData) {
  const configuredSpots = data.season?.rosterSpots?.length
    ? data.season.rosterSpots
    : FALLBACK_ROSTER_SPOTS;
  const rosterSpots = configuredSpots.map(normalizeRosterSpot);
  const activeRequired = countValues(
    rosterSpots.filter(
      (spot) =>
        spot !== RosterPosition.BN &&
        spot !== RosterPosition.IR &&
        spot !== RosterPosition.IRplus,
    ),
  );
  const activeAssigned = countValues(
    data.roster.map((player) => normalizeRosterSpot(player.lineupPos)),
  );
  const gaps = POSITION_ORDER.flatMap((position) => {
    const missing = Math.max(
      (activeRequired.get(position) ?? 0) - (activeAssigned.get(position) ?? 0),
      0,
    );
    return missing
      ? [{ position, label: POSITION_LABELS[position], missing }]
      : [];
  });
  const composition = ["F", "D", "G"].map((position) => ({
    position,
    count: data.roster.filter((player) => player.posGroup === position).length,
  }));
  const players = [...data.roster].sort(
    (left, right) =>
      rosterPositionOrder(left) - rosterPositionOrder(right) ||
      toNumber(right.overallRating, 0) - toNumber(left.overallRating, 0) ||
      left.fullName.localeCompare(right.fullName),
  );

  return {
    count: players.length,
    capacity: rosterSpots.length,
    openSpots: Math.max(rosterSpots.length - players.length, 0),
    unassigned: players.filter((player) => !player.lineupPos).length,
    gaps,
    composition,
    players,
  };
}

function buildCapView(data: OwnerCommandCenterData) {
  if (!data.season) return [];

  const seasons = data.seasons as unknown as Season[];
  const capByYear = calculateContractCapSpaceWindow(
    data.contracts as unknown as Contract[],
    data.season as unknown as Season,
    seasons,
  );
  const reservedBySeasonId = new Map<string, number>();
  data.pendingOffers.forEach((offer) => {
    getContractCoveredSeasonIds(
      {
        seasonId: offer.seasonId,
        contractLength: offer.contractLength,
      },
      seasons,
    ).forEach((seasonId) => {
      reservedBySeasonId.set(
        seasonId,
        (reservedBySeasonId.get(seasonId) ?? 0) + offer.salary,
      );
    });
  });
  const seasonByYear = new Map(
    data.seasons.map((season) => [seasonYear(season), season]),
  );
  const rosterPlayerIds = new Set(
    data.roster.map((player) => String(player.id)),
  );

  return capByYear.slice(0, 3).map((entry) => {
    const season = seasonByYear.get(entry.year);
    const reserved = season
      ? (reservedBySeasonId.get(String(season.id)) ?? 0)
      : 0;
    const playerCount = season
      ? new Set(
          data.contracts
            .filter(
              (contract) =>
                rosterPlayerIds.has(String(contract.playerId)) &&
                doesContractAffectSeason(
                  contract as unknown as Contract,
                  season as unknown as Season,
                  seasons,
                ),
            )
            .map((contract) => String(contract.playerId)),
        ).size
      : 0;
    return {
      ...entry,
      label: season?.name ?? entry.label,
      reserved,
      playerCount,
      remaining: entry.remaining - reserved,
    };
  });
}

function buildContractDecisions(data: OwnerCommandCenterData) {
  if (!data.season) return [];
  const orderedSeasons = [...data.seasons].sort(
    (left, right) => seasonYear(left) - seasonYear(right),
  );
  const activeIndex = orderedSeasons.findIndex(
    (season) => String(season.id) === String(data.season?.id),
  );
  const horizonSeason =
    orderedSeasons[Math.min(activeIndex + 1, orderedSeasons.length - 1)] ??
    data.season;
  const horizon = normalizeDateOnlyValue(horizonSeason.endDate);
  const today = normalizeDateOnlyValue(data.season.startDate);
  const playerById = new Map(
    data.roster.map((player) => [String(player.id), player]),
  );
  const latestByPlayer = new Map<string, (typeof data.contracts)[number]>();

  data.contracts.forEach((contract) => {
    if (!playerById.has(String(contract.playerId))) return;
    const expiry = normalizeDateOnlyValue(
      contract.capHitEndDate ?? contract.expiryDate,
    );
    if (!expiry || (today && expiry < today)) return;
    const current = latestByPlayer.get(String(contract.playerId));
    const currentExpiry = normalizeDateOnlyValue(
      current?.capHitEndDate ?? current?.expiryDate,
    );
    if (!current || !currentExpiry || expiry > currentExpiry) {
      latestByPlayer.set(String(contract.playerId), contract);
    }
  });

  return [...latestByPlayer.values()]
    .filter((contract) => {
      const expiry = normalizeDateOnlyValue(
        contract.capHitEndDate ?? contract.expiryDate,
      );
      return Boolean(expiry && (!horizon || expiry <= horizon));
    })
    .sort((left, right) =>
      String(left.capHitEndDate ?? left.expiryDate).localeCompare(
        String(right.capHitEndDate ?? right.expiryDate),
      ),
    )
    .map((contract) => ({
      id: contract.id,
      playerName:
        playerById.get(String(contract.playerId))?.fullName ?? "Unknown player",
      expiryStatus: contract.expiryStatus ?? "Decision",
      expiryDate: normalizeDateOnlyValue(
        contract.capHitEndDate ?? contract.expiryDate,
      ),
      capHit: toNumber(contract.capHit ?? contract.contractSalary, 0),
      affectsCurrentSeason: doesContractAffectSeason(
        contract as unknown as Contract,
        data.season as unknown as Season,
        data.seasons as unknown as Season[],
      ),
    }));
}

function buildDraftView(data: OwnerCommandCenterData) {
  const groups = new Map<
    string,
    {
      seasonId: string;
      seasonName: string;
      picks: number;
      rounds: Map<string, number>;
    }
  >();
  data.draftPicks.forEach((pick) => {
    const current = groups.get(pick.seasonId) ?? {
      seasonId: pick.seasonId,
      seasonName: pick.seasonName,
      picks: 0,
      rounds: new Map<string, number>(),
    };
    current.picks += 1;
    current.rounds.set(pick.round, (current.rounds.get(pick.round) ?? 0) + 1);
    groups.set(pick.seasonId, current);
  });

  return {
    count: data.draftPicks.length,
    acquired: data.draftPicks.filter((pick) => pick.isTraded).length,
    groups: [...groups.values()].map((group) => ({
      ...group,
      rounds: [...group.rounds.entries()]
        .sort((left, right) => Number(left[0]) - Number(right[0]))
        .map(([round, count]) => ({ round, count })),
    })),
  };
}

function buildActivity(data: OwnerCommandCenterData) {
  const tradeItems: OwnerCommandCenterActivityItem[] = data.tradeActivity.map(
    (item) => ({
      id: item.id,
      kind: "trade",
      title: `${item.teamName} listed ${item.playerName}`,
      detail: "New trade lead",
      occurredAt: item.occurredAt,
      href: "/leagueoffice?view=tradeBlock",
    }),
  );
  return tradeItems.sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
}

export function buildOwnerCommandCenterView(data: OwnerCommandCenterData) {
  const teamId = data.team?.id ?? "";
  const upcomingMatchups = data.upcomingMatchups.map((matchup) => ({
    ...matchup,
    href: matchupHref(matchup, data, teamId),
  }));
  const recentMatchups = data.recentMatchups.map((matchup) => ({
    ...matchup,
    result: matchupResult(matchup, teamId),
    score: matchupScore(matchup, teamId),
    href: matchupHref(matchup, data, teamId),
  }));
  const record = recentMatchups.reduce(
    (summary, matchup) => ({
      wins: summary.wins + Number(matchup.result === "W"),
      losses: summary.losses + Number(matchup.result === "L"),
      ties: summary.ties + Number(matchup.result === "T"),
    }),
    { wins: 0, losses: 0, ties: 0 },
  );

  return {
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    season: data.season,
    team: data.team,
    roster: buildRosterView(data),
    cap: buildCapView(data),
    contractDecisions: buildContractDecisions(data),
    matchup: {
      next: upcomingMatchups[0] ?? null,
      upcoming: upcomingMatchups,
      latest: recentMatchups[0] ?? null,
      recent: recentMatchups,
      record,
    },
    draft: buildDraftView(data),
    offers: data.pendingOffers,
    listedPlayers: data.listedPlayers,
    activity: buildActivity(data),
    actions: {
      exploreTrade: "/leagueoffice?view=tradeBlock",
      listPlayer: "/leagueoffice?view=tradeBlock#manage-trade-block-heading",
      reviewOffer: "/leagueoffice?view=freeAgents",
      viewRoster: buildLockerRoomNavigationHref("", {
        view: "roster",
        season: data.season?.id ?? null,
        owner: data.ownerId,
      }),
      viewDraftPicks: buildLockerRoomNavigationHref("", {
        view: "draft",
        season: data.season?.id ?? null,
        owner: data.ownerId,
      }),
    },
  };
}

export function countUnreadOwnerActivity(
  activity: readonly Pick<OwnerCommandCenterActivityItem, "occurredAt">[],
  lastViewedAt: string | null,
) {
  if (!lastViewedAt) return 0;
  return activity.filter((item) => item.occurredAt > lastViewedAt).length;
}

export function newestOwnerActivityAt(
  activity: readonly Pick<OwnerCommandCenterActivityItem, "occurredAt">[],
) {
  return activity.reduce<string | null>(
    (newest, item) =>
      newest === null || item.occurredAt > newest ? item.occurredAt : newest,
    null,
  );
}

export function ownerCommandCenterActivityStorageKey(ownerId: string) {
  return `${OWNER_COMMAND_CENTER_ACTIVITY_KEY}:${ownerId}`;
}

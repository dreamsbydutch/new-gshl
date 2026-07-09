"use client";

import { useMemo } from "react";
import { AWARD_CATALOG_BY_KEY } from "@gshl-lib/config/awards";
import {
  NHLLogo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-ui";
import {
  AwardsList,
  PositionGroup,
  SeasonType,
  type Awards,
  type GSHLTeam,
  type NHLTeam,
  type Player,
  type PlayerCareerSplitStatLine,
  type PlayerTotalStatLine,
  type Season,
} from "@gshl-types";
import { cn, formatNumber, toNumber } from "@gshl-utils";

type FranchiseCareerRow = {
  playerId: string;
  seasonType: SeasonType;
  posGroup: string;
  nhlPos: string[];
  nhlTeam: string;
  days: number;
  GP: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  SV: number;
  SA: number;
  SO: number;
  TOI: number;
  GAA: number | null;
  SVP: number | null;
};

type RecordStatKey =
  | "days"
  | "GP"
  | "G"
  | "A"
  | "P"
  | "PM"
  | "PIM"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W"
  | "SV"
  | "SO"
  | "GAA"
  | "SVP";

type AwardSummaryRow = {
  playerId: string;
  playerName: string;
  nhlTeam: NHLTeam | undefined;
  positions: string;
  totalAwards: number;
  firstTeamAllStars: number;
  secondTeamAllStars: number;
  playoffAllStars: number;
  latestYear: number | string;
  breakdown: string;
};

type RecordLeader = {
  key: string;
  label: string;
  playerId: string;
  playerName: string;
  nhlTeam: NHLTeam | undefined;
  positions: string;
  displayValue: string;
  note?: string;
};

interface TeamRecordBookProps {
  allAwards: Awards[];
  allTeams: GSHLTeam[];
  careerSplits: PlayerCareerSplitStatLine[];
  currentTeam: GSHLTeam;
  nhlTeams: NHLTeam[];
  playerTotals: PlayerTotalStatLine[];
  players: Player[];
  seasons: Season[];
}

const PLAYER_AWARD_KEYS = new Set<AwardsList>([
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
]);

const ALL_STAR_AWARD_KEYS = new Set<AwardsList>([
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
]);

const GOALIE_RATE_MINIMUMS: Record<SeasonType, number> = {
  [SeasonType.REGULAR_SEASON]: 10,
  [SeasonType.PLAYOFFS]: 3,
  [SeasonType.LOSERS_TOURNAMENT]: 3,
};

const HEADLINE_RECORDS: Array<{
  key: string;
  label: string;
  stat: RecordStatKey;
  seasonType: SeasonType;
  group: "all" | "skater" | "goalie";
}> = [
  {
    key: "most-games",
    label: "Most Games",
    stat: "GP",
    seasonType: SeasonType.REGULAR_SEASON,
    group: "all",
  },
  {
    key: "most-days",
    label: "Most Days",
    stat: "days",
    seasonType: SeasonType.REGULAR_SEASON,
    group: "all",
  },
  {
    key: "most-points",
    label: "Most Points",
    stat: "P",
    seasonType: SeasonType.REGULAR_SEASON,
    group: "skater",
  },
  {
    key: "most-wins",
    label: "Most Wins",
    stat: "W",
    seasonType: SeasonType.REGULAR_SEASON,
    group: "goalie",
  },
];

const SKATER_RECORD_DEFS: Array<{ key: RecordStatKey; label: string }> = [
  { key: "GP", label: "Games Played" },
  { key: "G", label: "Goals" },
  { key: "A", label: "Assists" },
  { key: "P", label: "Points" },
  { key: "PPP", label: "Power-Play Points" },
  { key: "SOG", label: "Shots on Goal" },
  { key: "HIT", label: "Hits" },
  { key: "BLK", label: "Blocks" },
  { key: "PM", label: "Plus/Minus" },
  { key: "PIM", label: "Penalty Minutes" },
];

const GOALIE_RECORD_DEFS: Array<{ key: RecordStatKey; label: string }> = [
  { key: "GP", label: "Games Played" },
  { key: "W", label: "Wins" },
  { key: "SV", label: "Saves" },
  { key: "SO", label: "Shutouts" },
  { key: "GAA", label: "Goals Against Average" },
  { key: "SVP", label: "Save Percentage" },
];

const CAREER_TOTAL_FIELDS: Array<keyof Omit<FranchiseCareerRow, "playerId" | "seasonType" | "posGroup" | "nhlPos" | "nhlTeam" | "GAA" | "SVP">> =
  [
    "days",
    "GP",
    "GS",
    "G",
    "A",
    "P",
    "PM",
    "PIM",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "W",
    "GA",
    "SV",
    "SA",
    "SO",
    "TOI",
  ];

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeIdList(entry));
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return [];
  }

  const raw = String(value).trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeIdList(parsed);
    }
  } catch {
    // Fall through to CSV parsing.
  }

  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function getAllStarSeasonType(awardKey: AwardsList): SeasonType {
  return awardKey === AwardsList.PLAYOFF_AS
    ? SeasonType.PLAYOFFS
    : SeasonType.REGULAR_SEASON;
}

function getPlayerAwardLabel(awardKey: AwardsList): string {
  if (awardKey === AwardsList.FIRST_AS) {
    return "First Team All-Star";
  }
  if (awardKey === AwardsList.SECOND_AS) {
    return "Second Team All-Star";
  }
  if (awardKey === AwardsList.PLAYOFF_AS) {
    return "Playoff All-Star";
  }

  return AWARD_CATALOG_BY_KEY.get(awardKey)?.fullName ?? awardKey;
}

function getPlayerPositions(
  player: Player | undefined,
  fallbackPositions: string[],
): string {
  const positions = player?.nhlPos ?? fallbackPositions;
  if (!Array.isArray(positions) || positions.length === 0) {
    return "-";
  }

  return positions.join("/");
}

function getNhlTeamForPlayer(
  nhlTeamsByAbbr: Map<string, NHLTeam>,
  player: Player | undefined,
  fallbackAbbr: string,
): NHLTeam | undefined {
  const teamAbbr = String(player?.nhlTeam ?? fallbackAbbr ?? "").trim();
  if (!teamAbbr) return undefined;
  return nhlTeamsByAbbr.get(teamAbbr);
}

function formatRecordValue(stat: RecordStatKey, value: number): string {
  if (stat === "SVP") {
    return formatNumber(value, 3);
  }
  if (stat === "GAA") {
    return formatNumber(value, 2);
  }
  return formatNumber(value, 0);
}

function buildFranchiseCareerRows(
  careerSplits: PlayerCareerSplitStatLine[],
  franchiseTeamIds: Set<string>,
): FranchiseCareerRow[] {
  const grouped = new Map<string, FranchiseCareerRow>();

  for (const row of careerSplits) {
    const teamId = String(row.gshlTeamId ?? "");
    const seasonType = String(row.seasonType ?? "") as SeasonType;
    const playerId = String(row.playerId ?? "");

    if (!franchiseTeamIds.has(teamId) || !playerId) {
      continue;
    }
    if (
      seasonType !== SeasonType.REGULAR_SEASON &&
      seasonType !== SeasonType.PLAYOFFS
    ) {
      continue;
    }

    const key = `${playerId}|${seasonType}`;
    const existing = grouped.get(key) ?? {
      playerId,
      seasonType,
      posGroup: String(row.posGroup ?? ""),
      nhlPos: normalizeIdList(row.nhlPos),
      nhlTeam: String(row.nhlTeam ?? "").trim(),
      days: 0,
      GP: 0,
      GS: 0,
      G: 0,
      A: 0,
      P: 0,
      PM: 0,
      PIM: 0,
      PPP: 0,
      SOG: 0,
      HIT: 0,
      BLK: 0,
      W: 0,
      GA: 0,
      SV: 0,
      SA: 0,
      SO: 0,
      TOI: 0,
      GAA: null,
      SVP: null,
    };

    if (!grouped.has(key)) {
      grouped.set(key, existing);
    }

    if (!existing.posGroup && row.posGroup) {
      existing.posGroup = String(row.posGroup);
    }

    for (const position of normalizeIdList(row.nhlPos)) {
      if (!existing.nhlPos.includes(position)) {
        existing.nhlPos.push(position);
      }
    }

    if (!existing.nhlTeam && row.nhlTeam) {
      existing.nhlTeam = String(row.nhlTeam).trim();
    }

    for (const field of CAREER_TOTAL_FIELDS) {
      existing[field] += toNumber(row[field], 0);
    }
  }

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    GAA: row.TOI > 0 ? (row.GA / row.TOI) * 60 : null,
    SVP: row.SA > 0 ? row.SV / row.SA : null,
  }));
}

function findLeader(
  rows: FranchiseCareerRow[],
  playersById: Map<string, Player>,
  nhlTeamsByAbbr: Map<string, NHLTeam>,
  definition: { key: string; label: string; stat: RecordStatKey },
  options: {
    seasonType: SeasonType;
    group: "all" | "skater" | "goalie";
  },
): RecordLeader | null {
  const filtered = rows.filter((row) => {
    if (row.seasonType !== options.seasonType) {
      return false;
    }

    const player = playersById.get(row.playerId);
    const posGroup = player?.posGroup ?? row.posGroup;

    const isGoalie = String(posGroup) === String(PositionGroup.G);

    if (options.group === "skater" && isGoalie) {
      return false;
    }
    if (options.group === "goalie" && !isGoalie) {
      return false;
    }

    const value = row[definition.stat];
    if (value == null || !Number.isFinite(value)) {
      return false;
    }

    if ((definition.stat === "GAA" || definition.stat === "SVP") && row.GS <= 0) {
      return false;
    }

    if (definition.stat === "GAA" || definition.stat === "SVP") {
      return row.GS >= GOALIE_RATE_MINIMUMS[options.seasonType];
    }

    return value > 0;
  });

  if (filtered.length === 0) {
    return null;
  }

  const sorted = filtered.slice().sort((left, right) => {
    const leftValue = left[definition.stat];
    const rightValue = right[definition.stat];

    if (definition.stat === "GAA") {
      if (leftValue !== rightValue) {
        return (leftValue ?? Number.POSITIVE_INFINITY) -
          (rightValue ?? Number.POSITIVE_INFINITY);
      }
    } else if ((rightValue ?? -Infinity) !== (leftValue ?? -Infinity)) {
      return (rightValue ?? -Infinity) - (leftValue ?? -Infinity);
    }

    if (right.GP !== left.GP) {
      return right.GP - left.GP;
    }

    const leftName = playersById.get(left.playerId)?.fullName ?? left.playerId;
    const rightName = playersById.get(right.playerId)?.fullName ?? right.playerId;
    return leftName.localeCompare(rightName);
  });

  const leader = sorted[0];
  if (!leader) {
    return null;
  }

  const player = playersById.get(leader.playerId);
  const nhlTeam = getNhlTeamForPlayer(
    nhlTeamsByAbbr,
    player,
    leader.nhlTeam,
  );

  return {
    key: definition.key,
    label: definition.label,
    playerId: leader.playerId,
    playerName: player?.fullName ?? `Player ${leader.playerId}`,
    nhlTeam,
    positions: getPlayerPositions(player, leader.nhlPos),
    displayValue: formatRecordValue(
      definition.stat,
      toNumber(leader[definition.stat], 0),
    ),
    note:
      definition.stat === "GAA" || definition.stat === "SVP"
        ? `Min ${GOALIE_RATE_MINIMUMS[options.seasonType]} starts`
        : undefined,
  };
}

function buildAwardSummaryRows({
  allAwards,
  allTeams,
  currentTeam,
  nhlTeamsByAbbr,
  playerTotals,
  playersById,
  seasonsById,
}: {
  allAwards: Awards[];
  allTeams: GSHLTeam[];
  currentTeam: GSHLTeam;
  nhlTeamsByAbbr: Map<string, NHLTeam>;
  playerTotals: PlayerTotalStatLine[];
  playersById: Map<string, Player>;
  seasonsById: Map<string, number>;
}): AwardSummaryRow[] {
  const franchiseTeams = allTeams.filter(
    (team) => String(team.franchiseId) === String(currentTeam.franchiseId),
  );
  const teamIdBySeason = new Map<string, string>(
    franchiseTeams.map((team) => [String(team.seasonId), String(team.id)]),
  );
  const summaryMap = new Map<
    string,
    {
      playerId: string;
      counts: Map<AwardsList, number>;
      totalAwards: number;
      firstTeamAllStars: number;
      secondTeamAllStars: number;
      playoffAllStars: number;
      latestYear: number | string;
    }
  >();

  for (const award of allAwards) {
    const awardKey = String(award.award) as AwardsList;
    if (!PLAYER_AWARD_KEYS.has(awardKey)) {
      continue;
    }

    const seasonId = String(award.seasonId);
    const teamId = teamIdBySeason.get(seasonId);
    if (!teamId) {
      continue;
    }

    const playerId = String(award.winnerId);
    const seasonType = ALL_STAR_AWARD_KEYS.has(awardKey)
      ? getAllStarSeasonType(awardKey)
      : SeasonType.REGULAR_SEASON;

    const belongsToFranchise = playerTotals.some((row) => {
      return (
        String(row.playerId) === playerId &&
        String(row.seasonId) === seasonId &&
        String(row.seasonType) === String(seasonType) &&
        normalizeIdList(row.gshlTeamIds).includes(teamId)
      );
    });

    if (!belongsToFranchise) {
      continue;
    }

    const seasonYear = seasonsById.get(seasonId) ?? seasonId;
    const existing = summaryMap.get(playerId) ?? {
      playerId,
      counts: new Map<AwardsList, number>(),
      totalAwards: 0,
      firstTeamAllStars: 0,
      secondTeamAllStars: 0,
      playoffAllStars: 0,
      latestYear: seasonYear,
    };

    if (!summaryMap.has(playerId)) {
      summaryMap.set(playerId, existing);
    }

    existing.totalAwards += 1;
    if (awardKey === AwardsList.FIRST_AS) {
      existing.firstTeamAllStars += 1;
    } else if (awardKey === AwardsList.SECOND_AS) {
      existing.secondTeamAllStars += 1;
    } else if (awardKey === AwardsList.PLAYOFF_AS) {
      existing.playoffAllStars += 1;
    }
    existing.counts.set(awardKey, (existing.counts.get(awardKey) ?? 0) + 1);

    if (Number(seasonYear) > Number(existing.latestYear)) {
      existing.latestYear = seasonYear;
    }
  }

  return Array.from(summaryMap.values())
    .map((summary) => {
      const player = playersById.get(summary.playerId);
      const breakdown = Array.from(summary.counts.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }
          return getPlayerAwardLabel(left[0]).localeCompare(
            getPlayerAwardLabel(right[0]),
          );
        })
        .map(([awardKey, count]) => `${count}x ${getPlayerAwardLabel(awardKey)}`)
        .join(", ");

      return {
        playerId: summary.playerId,
        playerName: player?.fullName ?? `Player ${summary.playerId}`,
        nhlTeam: getNhlTeamForPlayer(
          nhlTeamsByAbbr,
          player,
          String(player?.nhlTeam ?? ""),
        ),
        positions: getPlayerPositions(player, []),
        totalAwards: summary.totalAwards,
        firstTeamAllStars: summary.firstTeamAllStars,
        secondTeamAllStars: summary.secondTeamAllStars,
        playoffAllStars: summary.playoffAllStars,
        latestYear: summary.latestYear,
        breakdown,
      };
    })
    .sort((left, right) => {
      if (right.totalAwards !== left.totalAwards) {
        return right.totalAwards - left.totalAwards;
      }
      if (right.firstTeamAllStars !== left.firstTeamAllStars) {
        return right.firstTeamAllStars - left.firstTeamAllStars;
      }
      if (right.secondTeamAllStars !== left.secondTeamAllStars) {
        return right.secondTeamAllStars - left.secondTeamAllStars;
      }
      if (right.playoffAllStars !== left.playoffAllStars) {
        return right.playoffAllStars - left.playoffAllStars;
      }
      return left.playerName.localeCompare(right.playerName);
    });
}

function RecordBookDivider({ label }: { label: string }) {
  return (
    <div className="mb-6 mt-12 flex items-center gap-4 px-4">
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
      <span className="shrink-0 font-barlow text-xs uppercase tracking-[0.28em] text-gray-400">
        {label}
      </span>
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
    </div>
  );
}

function RecordLeaderCard({
  leader,
  className,
}: {
  leader: RecordLeader;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-[1.75rem] border border-gray-200 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <p className="font-barlow text-[11px] uppercase tracking-[0.24em] text-gray-400">
        {leader.label}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <NHLLogo team={leader.nhlTeam} size={34} className="mx-0 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-oswald text-2xl leading-none text-black">
            {leader.playerName}
          </p>
          <p className="font-barlow text-xs uppercase tracking-[0.18em] text-gray-500">
            {leader.positions}
          </p>
        </div>
      </div>
      <p className="mt-4 font-oswald text-4xl leading-none text-black">
        {leader.displayValue}
      </p>
      {leader.note ? (
        <p className="mt-2 text-xs text-muted-foreground">{leader.note}</p>
      ) : null}
    </article>
  );
}

function RecordLeadersTable({
  title,
  rows,
}: {
  title: string;
  rows: RecordLeader[];
}) {
  return (
    <div className="rounded-[1.75rem] border border-gray-200 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-3 px-1">
        <h3 className="font-oswald text-2xl leading-none text-black">
          {title}
        </h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Category</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>Pos</TableHead>
            <TableHead className="text-right">Record</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <NHLLogo team={row.nhlTeam} size={18} className="mx-0" />
                    <span>{row.playerName}</span>
                  </div>
                </TableCell>
                <TableCell>{row.positions}</TableCell>
                <TableCell className="text-right font-medium">
                  {row.displayValue}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                className="py-6 text-center text-sm text-muted-foreground"
                colSpan={4}
              >
                No records on file yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AwardsTable({
  rows,
}: {
  rows: AwardSummaryRow[];
}) {
  return (
    <div className="rounded-[1.75rem] border border-gray-200 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-3 px-1">
        <h3 className="font-oswald text-2xl leading-none text-black">
          Franchise All-Star Leaders
        </h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead>Player</TableHead>
            <TableHead>Pos</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">1st</TableHead>
            <TableHead className="text-right">2nd</TableHead>
            <TableHead className="text-right">Playoff</TableHead>
            <TableHead>Breakdown</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow key={row.playerId}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <NHLLogo team={row.nhlTeam} size={18} className="mx-0" />
                    <span>{row.playerName}</span>
                  </div>
                </TableCell>
                <TableCell>{row.positions}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatNumber(row.totalAwards, 0)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(row.firstTeamAllStars, 0)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(row.secondTeamAllStars, 0)}
                </TableCell>
                <TableCell className="text-right">
                  {formatNumber(row.playoffAllStars, 0)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.breakdown}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                className="py-6 text-center text-sm text-muted-foreground"
                colSpan={7}
              >
                No all-star selections on file for this franchise yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function TeamRecordBook(props: TeamRecordBookProps) {
  const {
    allAwards,
    allTeams,
    careerSplits,
    currentTeam,
    nhlTeams,
    playerTotals,
    players,
    seasons,
  } = props;

  const playersById = useMemo(
    () => new Map(players.map((player) => [String(player.id), player])),
    [players],
  );
  const nhlTeamsByAbbr = useMemo(
    () => new Map(nhlTeams.map((team) => [team.abbreviation, team])),
    [nhlTeams],
  );
  const seasonsById = useMemo(
    () => new Map(seasons.map((season) => [String(season.id), season.year])),
    [seasons],
  );

  const franchiseTeamIds = useMemo(
    () =>
      new Set(
        allTeams
          .filter(
            (team) =>
              String(team.franchiseId) === String(currentTeam.franchiseId),
          )
          .map((team) => String(team.id)),
      ),
    [allTeams, currentTeam.franchiseId],
  );

  const franchiseCareerRows = useMemo(
    () => buildFranchiseCareerRows(careerSplits, franchiseTeamIds),
    [careerSplits, franchiseTeamIds],
  );

  const headlineLeaders = useMemo(
    () =>
      HEADLINE_RECORDS.map((definition) =>
        findLeader(
          franchiseCareerRows,
          playersById,
          nhlTeamsByAbbr,
          definition,
          {
            seasonType: definition.seasonType,
            group: definition.group,
          },
        ),
      ).filter((leader): leader is RecordLeader => leader !== null),
    [franchiseCareerRows, nhlTeamsByAbbr, playersById],
  );

  const regularSeasonSkaterRows = useMemo(
    () =>
      SKATER_RECORD_DEFS.map((definition) =>
        findLeader(
          franchiseCareerRows,
          playersById,
          nhlTeamsByAbbr,
          {
            key: `rs-skater-${definition.key}`,
            label: definition.label,
            stat: definition.key,
          },
          {
            seasonType: SeasonType.REGULAR_SEASON,
            group: "skater",
          },
        ),
      ).filter((leader): leader is RecordLeader => leader !== null),
    [franchiseCareerRows, nhlTeamsByAbbr, playersById],
  );

  const regularSeasonGoalieRows = useMemo(
    () =>
      GOALIE_RECORD_DEFS.map((definition) =>
        findLeader(
          franchiseCareerRows,
          playersById,
          nhlTeamsByAbbr,
          {
            key: `rs-goalie-${definition.key}`,
            label: definition.label,
            stat: definition.key,
          },
          {
            seasonType: SeasonType.REGULAR_SEASON,
            group: "goalie",
          },
        ),
      ).filter((leader): leader is RecordLeader => leader !== null),
    [franchiseCareerRows, nhlTeamsByAbbr, playersById],
  );

  const playoffSkaterRows = useMemo(
    () =>
      SKATER_RECORD_DEFS.map((definition) =>
        findLeader(
          franchiseCareerRows,
          playersById,
          nhlTeamsByAbbr,
          {
            key: `po-skater-${definition.key}`,
            label: definition.label,
            stat: definition.key,
          },
          {
            seasonType: SeasonType.PLAYOFFS,
            group: "skater",
          },
        ),
      ).filter((leader): leader is RecordLeader => leader !== null),
    [franchiseCareerRows, nhlTeamsByAbbr, playersById],
  );

  const playoffGoalieRows = useMemo(
    () =>
      GOALIE_RECORD_DEFS.map((definition) =>
        findLeader(
          franchiseCareerRows,
          playersById,
          nhlTeamsByAbbr,
          {
            key: `po-goalie-${definition.key}`,
            label: definition.label,
            stat: definition.key,
          },
          {
            seasonType: SeasonType.PLAYOFFS,
            group: "goalie",
          },
        ),
      ).filter((leader): leader is RecordLeader => leader !== null),
    [franchiseCareerRows, nhlTeamsByAbbr, playersById],
  );

  const awardSummaryRows = useMemo(
    () =>
      buildAwardSummaryRows({
        allAwards,
        allTeams,
        currentTeam,
        nhlTeamsByAbbr,
        playerTotals,
        playersById,
        seasonsById,
      }),
    [
      allAwards,
      allTeams,
      currentTeam,
      nhlTeamsByAbbr,
      playerTotals,
      playersById,
      seasonsById,
    ],
  );

  const awardsLeader = awardSummaryRows[0];

  return (
    <section className="pb-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="rounded-[2rem] border border-gray-200 bg-[radial-gradient(circle_at_top,#fff_0%,#f8fafc_52%,#eef2ff_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
          <p className="font-barlow text-xs uppercase tracking-[0.32em] text-gray-400">
            Team Record Book
          </p>
          <h2 className="mt-3 font-oswald text-4xl leading-none text-black sm:text-5xl">
            Player records, franchise longevity, and individual honors.
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            All-time franchise leaders built from player career splits across
            every season this team has been on record.
          </p>
        </div>
      </div>

      <RecordBookDivider label="FRANCHISE LEADERS" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 xl:grid-cols-5">
        {headlineLeaders.map((leader) => (
          <RecordLeaderCard key={leader.key} leader={leader} />
        ))}
        {awardsLeader ? (
          <RecordLeaderCard
            leader={{
              key: "most-awards",
              label: "Most All-Star Honors",
              playerId: awardsLeader.playerId,
              playerName: awardsLeader.playerName,
              nhlTeam: awardsLeader.nhlTeam,
              positions: awardsLeader.positions,
              displayValue: formatNumber(awardsLeader.totalAwards, 0),
            }}
            className="sm:col-span-2 xl:col-span-1"
          />
        ) : null}
      </div>

      <RecordBookDivider label="REGULAR SEASON" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 lg:grid-cols-2">
        <RecordLeadersTable
          title="Skater Records"
          rows={regularSeasonSkaterRows}
        />
        <RecordLeadersTable
          title="Goalie Records"
          rows={regularSeasonGoalieRows}
        />
      </div>

      <RecordBookDivider label="PLAYOFFS" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4 lg:grid-cols-2">
        <RecordLeadersTable
          title="Skater Records"
          rows={playoffSkaterRows}
        />
        <RecordLeadersTable
          title="Goalie Records"
          rows={playoffGoalieRows}
        />
      </div>

      <RecordBookDivider label="ALL-STAR TEAMS" />
      <div className="mx-auto max-w-6xl px-4">
        <AwardsTable rows={awardSummaryRows} />
      </div>
    </section>
  );
}

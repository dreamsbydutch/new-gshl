"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-ui";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type {
  AwardSummaryRow,
  RecordLeader,
  RecordStatKey,
  SeasonType as SeasonTypeValue,
  TeamRecordBookProps,
} from "@gshl-types";
import {
  buildAwardSummaryRows,
  buildFranchiseCareerRows,
  cn,
  findLeader,
  formatNumber,
  SeasonType,
} from "@gshl-utils";

const HEADLINE_RECORDS: Array<{
  key: string;
  label: string;
  stat: RecordStatKey;
  seasonType: SeasonTypeValue;
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

function AwardsTable({ rows }: { rows: AwardSummaryRow[] }) {
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
    playerAwards,
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
        playerAwards,
        allTeams,
        currentTeam,
        nhlTeamsByAbbr,
        playerTotals,
        playersById,
        seasonsById,
      }),
    [
      playerAwards,
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
        <RecordLeadersTable title="Skater Records" rows={playoffSkaterRows} />
        <RecordLeadersTable title="Goalie Records" rows={playoffGoalieRows} />
      </div>

      <RecordBookDivider label="ALL-STAR TEAMS" />
      <div className="mx-auto max-w-6xl px-4">
        <AwardsTable rows={awardSummaryRows} />
      </div>
    </section>
  );
}

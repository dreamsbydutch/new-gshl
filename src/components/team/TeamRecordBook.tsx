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
  AllTimeRosterEntry,
  AwardSummaryRow,
  FranchiseCareerRow,
  NHLTeam,
  Player,
  TeamRecordBookProps,
} from "@gshl-types";
import {
  ALL_TIME_ROSTER_SLOTS,
  buildAllTimeFranchiseRoster,
  buildAwardSummaryRows,
  buildFranchiseCareerRows,
  cn,
  formatNumber,
  getNhlTeamForPlayer,
  getPlayerPositions,
  PositionGroup,
  SeasonType,
} from "@gshl-utils";

function RecordBookDivider({ label }: { label: string }) {
  return (
    <div className="mb-6 mt-12 flex items-center gap-4 px-4">
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
      <span className="shrink-0 font-varela text-xs uppercase tracking-[0.24em] text-gray-400">
        {label}
      </span>
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
    </div>
  );
}

function isGoalieRow(
  row: FranchiseCareerRow,
  playersById: Map<string, Player>,
): boolean {
  return (
    String(playersById.get(row.playerId)?.posGroup ?? row.posGroup) ===
    PositionGroup.G
  );
}

function sortFranchiseStats(
  rows: FranchiseCareerRow[],
  playersById: Map<string, Player>,
  goalie: boolean,
): FranchiseCareerRow[] {
  return rows
    .filter((row) => isGoalieRow(row, playersById) === goalie)
    .sort((left, right) => {
      const primary = goalie ? right.W - left.W : right.P - left.P;
      if (primary !== 0) return primary;
      return right.GP - left.GP;
    });
}

function PlayerRowIdentity({
  row,
  playersById,
  nhlTeamsByAbbr,
}: {
  row: FranchiseCareerRow;
  playersById: Map<string, Player>;
  nhlTeamsByAbbr: Map<string, NHLTeam>;
}) {
  const player = playersById.get(row.playerId);
  const nhlTeam = getNhlTeamForPlayer(nhlTeamsByAbbr, player, row.nhlTeam);

  return (
    <div className="flex min-w-[170px] items-center gap-2">
      <NHLLogo team={nhlTeam} size={22} className="mx-0 shrink-0" />
      <div className="min-w-0">
        <p className="truncate font-varela text-sm font-semibold text-slate-900">
          {player?.fullName ?? `Player ${row.playerId}`}
        </p>
        <p className="font-varela text-[10px] uppercase tracking-[0.12em] text-slate-500">
          {getPlayerPositions(player, row.nhlPos)}
        </p>
      </div>
    </div>
  );
}

function AwardMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="font-varela text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-900/60">
        {label}
      </p>
      <p className="mt-2 font-varela text-3xl font-bold leading-none text-amber-950">
        {value}
      </p>
      <p className="mt-2 font-varela text-xs text-amber-950/65">{detail}</p>
    </div>
  );
}

function AwardsTable({ rows }: { rows: AwardSummaryRow[] }) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-amber-200 bg-white shadow-[0_18px_40px_rgba(120,53,15,0.08)]">
      <div className="border-b border-amber-100 bg-amber-50/55 px-5 py-4">
        <h3 className="font-varela text-xl font-bold text-slate-950">
          Franchise player honors
        </h3>
        <p className="mt-1 font-varela text-xs text-slate-500">
          Every recorded player trophy and all-star selection earned while
          representing this franchise.
        </p>
      </div>
      <Table className="min-w-[840px] font-varela">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>Player</TableHead>
            <TableHead className="text-right">Honors</TableHead>
            <TableHead className="text-right">Trophies</TableHead>
            <TableHead className="text-right">1st AS</TableHead>
            <TableHead className="text-right">2nd AS</TableHead>
            <TableHead className="text-right">Playoff AS</TableHead>
            <TableHead>Latest</TableHead>
            <TableHead>Honor cabinet</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => {
              const allStarAwards =
                row.firstTeamAllStars +
                row.secondTeamAllStars +
                row.playoffAllStars;
              return (
                <TableRow key={row.playerId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <NHLLogo team={row.nhlTeam} size={22} className="mx-0" />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {row.playerName}
                        </p>
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          {row.positions}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatNumber(row.totalAwards, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.totalAwards - allStarAwards, 0)}
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
                  <TableCell>{row.latestYear}</TableCell>
                  <TableCell className="max-w-[300px] text-xs text-slate-500">
                    {row.breakdown}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                className="py-8 text-center text-sm text-muted-foreground"
                colSpan={8}
              >
                No player honors are on file for this franchise yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AllTimeRosterCard({
  slot,
  entry,
}: {
  slot: string;
  entry: AllTimeRosterEntry | undefined;
}) {
  return (
    <article
      className={cn(
        "rounded-[1.5rem] border bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.07)]",
        entry ? "border-slate-200" : "border-dashed border-slate-300",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-slate-900 px-3 py-1 font-varela text-[11px] font-bold uppercase tracking-[0.16em] text-white">
          {slot}
        </span>
        {entry ? (
          <NHLLogo team={entry.nhlTeam} size={26} className="mx-0" />
        ) : null}
      </div>
      {entry ? (
        <>
          <h3 className="mt-5 truncate font-varela text-lg font-bold text-slate-950">
            {entry.playerName}
          </h3>
          <p className="mt-1 font-varela text-[10px] uppercase tracking-[0.14em] text-slate-500">
            {entry.positions} · regular-season career split
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
            <div>
              <p className="font-varela text-[10px] uppercase text-slate-400">
                GP
              </p>
              <p className="font-varela text-sm font-bold text-slate-900">
                {formatNumber(entry.row.GP, 0)}
              </p>
            </div>
            <div>
              <p className="font-varela text-[10px] uppercase text-slate-400">
                {slot === "G" ? "W" : "P"}
              </p>
              <p className="font-varela text-sm font-bold text-slate-900">
                {formatNumber(slot === "G" ? entry.row.W : entry.row.P, 0)}
              </p>
            </div>
            <div>
              <p className="font-varela text-[10px] uppercase text-slate-400">
                {slot === "G" ? "SV%" : "G"}
              </p>
              <p className="font-varela text-sm font-bold text-slate-900">
                {formatNumber(
                  slot === "G" ? entry.row.SVP : entry.row.G,
                  slot === "G" ? 3 : 0,
                )}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-5 font-varela text-sm text-slate-400">
          No qualifying split yet.
        </p>
      )}
    </article>
  );
}

function AllTimeFranchiseRoster({ lineup }: { lineup: AllTimeRosterEntry[] }) {
  const slotRows = ALL_TIME_ROSTER_SLOTS.map((slot, index) => ({
    slot,
    entry: lineup.filter((lineupEntry) => lineupEntry.slot === slot)[
      slot === "D" ? index - 3 : 0
    ],
  }));

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50/65 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-varela text-xl font-bold text-slate-950">
            All-time franchise team
          </h3>
          <p className="font-varela text-xs text-slate-500">
            Best regular-season career split at every lineup position.
          </p>
        </div>
        <p className="font-varela text-[10px] uppercase tracking-[0.16em] text-slate-400">
          C · LW · RW · D · D · G
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slotRows.map(({ slot, entry }, index) => (
          <AllTimeRosterCard
            key={`${slot}-${index}`}
            slot={slot}
            entry={entry}
          />
        ))}
      </div>
    </div>
  );
}

function FranchiseStatsTable({
  title,
  rows,
  playersById,
  nhlTeamsByAbbr,
  kind,
}: {
  title: string;
  rows: FranchiseCareerRow[];
  playersById: Map<string, Player>;
  nhlTeamsByAbbr: Map<string, NHLTeam>;
  kind: "skater" | "goalie";
}) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="font-varela text-xl font-bold text-slate-950">
          {title}
        </h3>
        <p className="mt-1 font-varela text-xs text-slate-500">
          Aggregated player career splits for this franchise.
        </p>
      </div>
      {kind === "skater" ? (
        <Table className="min-w-[820px] font-varela">
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Player</TableHead>
              <TableHead className="text-right">GP</TableHead>
              <TableHead className="text-right">G</TableHead>
              <TableHead className="text-right">A</TableHead>
              <TableHead className="text-right">P</TableHead>
              <TableHead className="text-right">PPP</TableHead>
              <TableHead className="text-right">SOG</TableHead>
              <TableHead className="text-right">HIT</TableHead>
              <TableHead className="text-right">BLK</TableHead>
              <TableHead className="text-right">+/-</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.playerId}>
                  <TableCell>
                    <PlayerRowIdentity
                      row={row}
                      playersById={playersById}
                      nhlTeamsByAbbr={nhlTeamsByAbbr}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.GP, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.G, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.A, 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatNumber(row.P, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.PPP, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.SOG, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.HIT, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.BLK, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.PM, 0)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-sm text-muted-foreground"
                  colSpan={10}
                >
                  No skater statistics are on file yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      ) : (
        <Table className="min-w-[650px] font-varela">
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>Player</TableHead>
              <TableHead className="text-right">GP</TableHead>
              <TableHead className="text-right">GS</TableHead>
              <TableHead className="text-right">W</TableHead>
              <TableHead className="text-right">SV</TableHead>
              <TableHead className="text-right">SO</TableHead>
              <TableHead className="text-right">GAA</TableHead>
              <TableHead className="text-right">SV%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.playerId}>
                  <TableCell>
                    <PlayerRowIdentity
                      row={row}
                      playersById={playersById}
                      nhlTeamsByAbbr={nhlTeamsByAbbr}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.GP, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.GS, 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatNumber(row.W, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.SV, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.SO, 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.GAA, 2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.SVP, 3)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-sm text-muted-foreground"
                  colSpan={8}
                >
                  No goalie statistics are on file yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
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
  const allTimeLineup = useMemo(
    () =>
      buildAllTimeFranchiseRoster(
        franchiseCareerRows,
        playersById,
        nhlTeamsByAbbr,
      ),
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
  const regularSeasonRows = useMemo(
    () =>
      franchiseCareerRows.filter(
        (row) => row.seasonType === SeasonType.REGULAR_SEASON,
      ),
    [franchiseCareerRows],
  );
  const playoffRows = useMemo(
    () =>
      franchiseCareerRows.filter(
        (row) => row.seasonType === SeasonType.PLAYOFFS,
      ),
    [franchiseCareerRows],
  );
  const regularSeasonSkaters = useMemo(
    () => sortFranchiseStats(regularSeasonRows, playersById, false),
    [playersById, regularSeasonRows],
  );
  const regularSeasonGoalies = useMemo(
    () => sortFranchiseStats(regularSeasonRows, playersById, true),
    [playersById, regularSeasonRows],
  );
  const playoffSkaters = useMemo(
    () => sortFranchiseStats(playoffRows, playersById, false),
    [playersById, playoffRows],
  );
  const playoffGoalies = useMemo(
    () => sortFranchiseStats(playoffRows, playersById, true),
    [playersById, playoffRows],
  );
  const totalAwards = awardSummaryRows.reduce(
    (total, row) => total + row.totalAwards,
    0,
  );
  const totalAllStarSelections = awardSummaryRows.reduce(
    (total, row) =>
      total +
      row.firstTeamAllStars +
      row.secondTeamAllStars +
      row.playoffAllStars,
    0,
  );

  return (
    <section className="pb-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top,#fff_0%,#fffaf0_50%,#eef2ff_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-8">
          <p className="font-varela text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Franchise record book
          </p>
          <h2 className="mt-3 max-w-3xl font-varela text-3xl font-bold leading-tight text-slate-950 sm:text-5xl">
            The players, honors, and stat lines that define this franchise.
          </h2>
          <p className="mt-3 max-w-3xl font-varela text-sm leading-6 text-slate-600">
            Player awards come first, followed by the all-time franchise team
            and the career tables behind every selection.
          </p>
        </div>
      </div>

      <RecordBookDivider label="PLAYER AWARDS" />
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <AwardMetric
            label="Franchise honors"
            value={formatNumber(totalAwards, 0)}
            detail="Player trophies and all-star selections"
          />
          <AwardMetric
            label="Honored players"
            value={formatNumber(awardSummaryRows.length, 0)}
            detail="Unique franchise award winners"
          />
          <AwardMetric
            label="All-star selections"
            value={formatNumber(totalAllStarSelections, 0)}
            detail="First, second, and playoff teams"
          />
        </div>
        <AwardsTable rows={awardSummaryRows} />
      </div>

      <RecordBookDivider label="ALL-TIME FRANCHISE TEAM" />
      <div className="mx-auto max-w-6xl px-4">
        <AllTimeFranchiseRoster lineup={allTimeLineup} />
      </div>

      <RecordBookDivider label="REGULAR-SEASON CAREER STATS" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4">
        <FranchiseStatsTable
          title="Franchise skater statistics"
          rows={regularSeasonSkaters}
          playersById={playersById}
          nhlTeamsByAbbr={nhlTeamsByAbbr}
          kind="skater"
        />
        <FranchiseStatsTable
          title="Franchise goalie statistics"
          rows={regularSeasonGoalies}
          playersById={playersById}
          nhlTeamsByAbbr={nhlTeamsByAbbr}
          kind="goalie"
        />
      </div>

      <RecordBookDivider label="PLAYOFF CAREER STATS" />
      <div className="mx-auto grid max-w-6xl gap-4 px-4">
        <FranchiseStatsTable
          title="Playoff skater statistics"
          rows={playoffSkaters}
          playersById={playersById}
          nhlTeamsByAbbr={nhlTeamsByAbbr}
          kind="skater"
        />
        <FranchiseStatsTable
          title="Playoff goalie statistics"
          rows={playoffGoalies}
          playersById={playersById}
          nhlTeamsByAbbr={nhlTeamsByAbbr}
          kind="goalie"
        />
      </div>
    </section>
  );
}

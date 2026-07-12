"use client";

import { useMemo } from "react";
import Image from "next/image";
import {
  LoadingSpinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-ui";
import { useSeasons, useWeeks, useWeeklyScheduleData } from "@gshl-hooks";
import type {
  CategoryResult,
  GSHLTeam,
  MatchupDetailsContentProps,
  MatchupPlayerStat,
  StarPlayer,
} from "@gshl-types";
import { findTeamById } from "@gshl-utils/domain/team";
import {
  buildCategoryResults,
  formatMatchupPlayerName,
  formatMatchupPlayerPositions,
  formatStatValue,
  formatWeekRange,
  getGameTypeDisplay,
  getStarPlayers,
  PLAYER_STAT_COLUMNS,
  renderPlayerStatCell,
  resolveMatchupCategories,
  toStatNumber,
} from "@gshl-utils";

function MatchupSummaryTeam({
  team,
  score,
  alignment,
}: {
  team: GSHLTeam | null;
  score: number;
  alignment: "left" | "right";
}) {
  return (
    <div
      className={`flex items-center gap-3 ${alignment === "right" ? "justify-end text-right" : "text-left"}`}
    >
      {alignment === "right" ? (
        <>
          <div>
            <div className="text-lg font-semibold text-slate-900">
              {team?.name ?? "Unknown Team"}
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {team?.ownerNickname ?? team?.confAbbr ?? "Team"}
            </div>
          </div>
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt={team.name ?? "Team Logo"}
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {team?.abbr?.slice(0, 3) ?? "?"}
            </div>
          )}
        </>
      ) : (
        <>
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt={team.name ?? "Team Logo"}
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {team?.abbr?.slice(0, 3) ?? "?"}
            </div>
          )}
          <div>
            <div className="text-lg font-semibold text-slate-900">
              {team?.name ?? "Unknown Team"}
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {team?.ownerNickname ?? team?.confAbbr ?? "Team"}
            </div>
          </div>
        </>
      )}
      <div className="min-w-12 font-oswald text-4xl text-slate-900">{score}</div>
    </div>
  );
}

function CategoryResultsCard({
  title,
  categories,
  homeTeam,
  awayTeam,
}: {
  title: string;
  categories: CategoryResult[];
  homeTeam: GSHLTeam | null;
  awayTeam: GSHLTeam | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-oswald text-2xl text-slate-900">{title}</h2>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          Category Results
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 text-sm">
        <div className="text-left font-semibold text-slate-500">
          {awayTeam?.abbr ?? awayTeam?.name ?? "Away"}
        </div>
        <div className="text-center font-semibold text-slate-500">Cat</div>
        <div className="text-right font-semibold text-slate-500">
          {homeTeam?.abbr ?? homeTeam?.name ?? "Home"}
        </div>
        {categories.map((category) => (
          <FragmentCategoryRow key={category.key} category={category} />
        ))}
      </div>
    </section>
  );
}

function FragmentCategoryRow({
  category,
}: {
  category: CategoryResult;
}) {
  const awayClass =
    category.winner === "away"
      ? "font-semibold text-emerald-700"
      : category.winner === "tie"
        ? "text-slate-600"
        : "text-slate-400";
  const homeClass =
    category.winner === "home"
      ? "font-semibold text-emerald-700"
      : category.winner === "tie"
        ? "text-slate-600"
        : "text-slate-400";

  return (
    <>
      <div className={`rounded-lg px-2 py-1 text-left ${awayClass}`}>
        {category.awayValue}
      </div>
      <div className="rounded-lg bg-slate-100 px-2 py-1 text-center font-medium text-slate-700">
        {category.label}
      </div>
      <div className={`rounded-lg px-2 py-1 text-right ${homeClass}`}>
        {category.homeValue}
      </div>
    </>
  );
}

function StarsCard({ stars }: { stars: StarPlayer[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-oswald text-2xl text-slate-900">Three Stars</h2>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          Ranked by weekly rating
        </div>
      </div>
      {stars.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No player performances available for this matchup yet.
        </div>
      ) : (
        <div className="space-y-3">
          {stars.map((star) => (
            <div
              key={`${star.playerId}-${star.starRank}`}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 font-oswald text-xl text-amber-800">
                  {star.starRank}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    {formatMatchupPlayerName(star)}
                  </div>
                  <div className="text-sm text-slate-500">
                    {star.team?.name ?? "Unknown Team"} -{" "}
                    {formatMatchupPlayerPositions(star)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-slate-900">
                  Rating {formatStatValue(star.numericRating, 2)}
                </div>
                <div className="text-sm text-slate-500">
                  {formatStatValue(star.G)} G - {formatStatValue(star.A)} A -{" "}
                  {formatStatValue(star.P)} P
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlayerStatsTable({
  team,
  players,
}: {
  team: GSHLTeam | null;
  players: MatchupPlayerStat[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt={team.name ?? "Team Logo"}
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {team?.abbr?.slice(0, 3) ?? "?"}
            </div>
          )}
          <div>
            <h2 className="font-oswald text-2xl text-slate-900">
              {team?.name ?? "Unknown Team"}
            </h2>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Weekly Player Stats
            </div>
          </div>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          {players.length} Players
        </div>
      </div>
      <Table className="min-w-[1220px]">
        <TableHeader>
          <TableRow>
            {PLAYER_STAT_COLUMNS.map((column) => (
              <TableHead
                key={column.label}
                className={column.className ?? "whitespace-nowrap"}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={PLAYER_STAT_COLUMNS.length}
                className="py-8 text-center text-slate-500"
              >
                No player stats available yet.
              </TableCell>
            </TableRow>
          ) : (
            players.map((player) => (
              <TableRow key={player.id}>
                {PLAYER_STAT_COLUMNS.map((column) => (
                  <TableCell
                    key={`${player.id}-${column.label}`}
                    className={column.className ?? "whitespace-nowrap"}
                  >
                    {renderPlayerStatCell(player, column.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}

export function MatchupDetailsContent({
  matchupId,
  seasonId,
  weekId,
}: MatchupDetailsContentProps) {
  const scheduleData = useWeeklyScheduleData({ seasonId, weekId });
  const { data: seasonData = [] } = useSeasons({
    seasonId,
    enabled: Boolean(seasonId),
  });
  const { data: weekData = [] } = useWeeks({
    weekId,
    enabled: Boolean(weekId),
  });

  const matchup = useMemo(
    () => scheduleData.matchups.find((entry) => String(entry.id) === matchupId),
    [matchupId, scheduleData.matchups],
  );
  const season = seasonData[0] ?? null;
  const week = weekData[0] ?? null;
  const teamLookup = useMemo(() => {
    return new Map(scheduleData.teams.map((team) => [String(team.id), team]));
  }, [scheduleData.teams]);

  const homeTeam = matchup
    ? (findTeamById(scheduleData.teams, matchup.homeTeamId) ?? null)
    : null;
  const awayTeam = matchup
    ? (findTeamById(scheduleData.teams, matchup.awayTeamId) ?? null)
    : null;
  const homeTeamStats = matchup
    ? scheduleData.teamWeekStatsByTeam[String(matchup.homeTeamId)] ?? null
    : null;
  const awayTeamStats = matchup
    ? scheduleData.teamWeekStatsByTeam[String(matchup.awayTeamId)] ?? null
    : null;

  const matchupCategories = useMemo(
    () => resolveMatchupCategories(season?.categories),
    [season?.categories],
  );

  const categoryResults = useMemo<CategoryResult[]>(() => {
    if (!homeTeamStats || !awayTeamStats) return [];

    return buildCategoryResults(homeTeamStats, awayTeamStats, matchupCategories);
  }, [awayTeamStats, homeTeamStats, matchupCategories]);

  const computedScore = useMemo(() => {
    return categoryResults.reduce(
      (scores, category) => {
        if (category.winner === "home") scores.home += 1;
        if (category.winner === "away") scores.away += 1;
        return scores;
      },
      { home: 0, away: 0 },
    );
  }, [categoryResults]);

  const matchupScore = {
    home: matchup?.homeScore ?? computedScore.home,
    away: matchup?.awayScore ?? computedScore.away,
  };

  const matchupStatus = useMemo(() => {
    if (!matchup) return "Matchup unavailable";
    if (matchup.homeWin) return `${homeTeam?.name ?? "Home team"} won the matchup`;
    if (matchup.awayWin) return `${awayTeam?.name ?? "Away team"} won the matchup`;
    if (matchup.tie) return "Matchup ended in a tie";
    if (matchup.isComplete) return "Matchup complete";
    return "Matchup in progress";
  }, [awayTeam?.name, homeTeam?.name, matchup]);

  const homePlayers = useMemo(() => {
    const players =
      (matchup
        ? scheduleData.playerWeekStatsByTeam[String(matchup.homeTeamId)]
        : []) ?? [];

    return [...players].sort((left, right) => {
      const ratingDelta = toStatNumber(right.Rating) - toStatNumber(left.Rating);
      if (ratingDelta !== 0) return ratingDelta;
      return formatMatchupPlayerName(left).localeCompare(
        formatMatchupPlayerName(right),
      );
    });
  }, [matchup, scheduleData.playerWeekStatsByTeam]);

  const awayPlayers = useMemo(() => {
    const players =
      (matchup
        ? scheduleData.playerWeekStatsByTeam[String(matchup.awayTeamId)]
        : []) ?? [];

    return [...players].sort((left, right) => {
      const ratingDelta = toStatNumber(right.Rating) - toStatNumber(left.Rating);
      if (ratingDelta !== 0) return ratingDelta;
      return formatMatchupPlayerName(left).localeCompare(
        formatMatchupPlayerName(right),
      );
    });
  }, [matchup, scheduleData.playerWeekStatsByTeam]);

  const stars = useMemo(
    () => getStarPlayers([...awayPlayers, ...homePlayers], teamLookup),
    [awayPlayers, homePlayers, teamLookup],
  );

  const weekRange = formatWeekRange(week?.startDate, week?.endDate);
  const gameDisplay = matchup
    ? getGameTypeDisplay(
        String(matchup.gameType),
        week ?? undefined,
        "HOME",
        awayTeam ?? undefined,
        homeTeam ?? undefined,
      )
    : null;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    if (typeof window !== "undefined") {
      window.location.assign("/schedule");
    }
  };

  if (scheduleData.isLoading && !matchup) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4 py-10">
        <div className="flex items-center gap-3 text-slate-500">
          <LoadingSpinner />
          Loading matchup details...
        </div>
      </main>
    );
  }

  if (scheduleData.error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          Couldn&apos;t load this matchup right now.
        </div>
      </main>
    );
  }

  if (!matchup) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
          Matchup details were not found for this week.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24 lg:pb-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
        >
          Back
        </button>
        <div className="text-right text-xs uppercase tracking-[0.18em] text-slate-500">
          {season?.name ?? "Season"} {gameDisplay ? `- ${gameDisplay.label}` : ""}
          {weekRange ? ` - ${weekRange}` : ""}
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
            Matchup Score
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <MatchupSummaryTeam
              team={awayTeam}
              score={matchupScore.away}
              alignment="right"
            />
            <div className="text-center">
              <div className="font-oswald text-3xl text-slate-800">vs</div>
              <div className="mt-1 text-sm text-slate-500">{matchupStatus}</div>
            </div>
            <MatchupSummaryTeam
              team={homeTeam}
              score={matchupScore.home}
              alignment="left"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <CategoryResultsCard
            title="Matchup Breakdown"
            categories={categoryResults}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
          />
          <StarsCard stars={stars} />
        </div>
      </section>

      <div className="mt-6 grid gap-6">
        <PlayerStatsTable team={awayTeam} players={awayPlayers} />
        <PlayerStatsTable team={homeTeam} players={homePlayers} />
      </div>
    </main>
  );
}

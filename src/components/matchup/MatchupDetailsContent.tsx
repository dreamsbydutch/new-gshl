"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { MatchupSkeleton } from "@gshl-skeletons";
import {
  lighten,
  readableText,
  useNHLTeams,
  useSeasons,
  useTeamColor,
  useWeeks,
  useWeeklyScheduleData,
} from "@gshl-hooks";
import type {
  CategoryResult,
  GSHLTeam,
  MatchupDetailsContentProps,
  NHLTeam,
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
  resolveMatchupCategories,
  toStatNumber,
} from "@gshl-utils";
import { PlayerStatsTable } from "./PlayerStatsTable";
import { ArrowLeftIcon } from "lucide-react";

function MatchupSummaryTeam({
  team,
  score,
  alignment,
}: {
  team: GSHLTeam | null;
  score: number;
  alignment: "left" | "right";
}) {
  const fallbackLabel = alignment === "right" ? "Away" : "Home";
  const logo = team?.logoUrl ? (
    <Image
      src={team.logoUrl}
      alt={team.name ?? "Team Logo"}
      width={44}
      height={44}
      className="h-7 w-7 shrink-0 object-contain sm:h-11 sm:w-11"
    />
  ) : (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 sm:h-11 sm:w-11 sm:text-sm">
      {team?.abbr?.slice(0, 3) ?? "?"}
    </div>
  );
  const teamName = (
    <div className="min-w-0">
      <div className="truncate text-xs font-semibold leading-tight text-slate-900 sm:text-lg">
        <span className="sm:hidden">
          {team?.abbr ?? team?.name ?? fallbackLabel}
        </span>
        <span className="hidden sm:inline">{team?.name ?? "Unknown Team"}</span>
      </div>
      <div className="hidden text-xs uppercase tracking-[0.18em] text-slate-500 sm:block">
        {team?.ownerNickname ?? team?.confAbbr ?? "Team"}
      </div>
    </div>
  );
  const teamScore = (
    <div className="min-w-7 font-oswald text-2xl leading-none text-slate-900 sm:min-w-12 sm:text-4xl">
      {score}
    </div>
  );

  return (
    <div
      className={`grid min-w-0 items-center gap-1.5 sm:flex sm:gap-3 ${
        alignment === "right"
          ? "grid-cols-[minmax(0,1fr)_auto] text-right sm:justify-end"
          : "grid-cols-[auto_minmax(0,1fr)] text-left"
      }`}
    >
      {alignment === "right" ? (
        <>
          {teamName}
          <div className="flex items-center gap-1.5 sm:contents">
            {logo}
            {teamScore}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 sm:contents">
            {teamScore}
            {logo}
          </div>
          {teamName}
        </>
      )}
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
    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="mb-2 sm:mb-4">
        <h2 className="font-oswald text-xl text-slate-900 sm:text-2xl">
          {title}
        </h2>
      </div>
      {categories.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No category data available yet.
        </div>
      ) : (
        <div className="-mx-0.5 overflow-x-auto pb-1 sm:mx-0">
          <table className="min-w-max text-[10px] sm:w-full sm:text-sm">
            <tbody>
              <tr>
                <td className="sticky left-0 whitespace-nowrap bg-white pb-1 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs">
                  {awayTeam?.abbr ?? awayTeam?.name ?? "Away"}
                </td>
                {categories.map((cat) => (
                  <td
                    key={cat.key}
                    className={`whitespace-nowrap px-0.5 pb-1 text-center text-[10px] sm:px-1 sm:text-sm ${
                      cat.winner === "away"
                        ? "font-semibold text-emerald-600"
                        : cat.winner === "tie"
                          ? "text-slate-500"
                          : "text-slate-300"
                    }`}
                  >
                    {cat.awayValue}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-white" />
                {categories.map((cat) => (
                  <td key={cat.key} className="px-0.5 py-1 text-center">
                    <span className="inline-block whitespace-nowrap rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-500 sm:px-1.5 sm:text-xs">
                      {cat.label}
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 whitespace-nowrap bg-white pr-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs">
                  {homeTeam?.abbr ?? homeTeam?.name ?? "Home"}
                </td>
                {categories.map((cat) => (
                  <td
                    key={cat.key}
                    className={`whitespace-nowrap px-0.5 pt-1 text-center text-[10px] sm:px-1 sm:text-sm ${
                      cat.winner === "home"
                        ? "font-semibold text-emerald-600"
                        : cat.winner === "tie"
                          ? "text-slate-500"
                          : "text-slate-300"
                    }`}
                  >
                    {cat.homeValue}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const STAR_RANK_CONFIG = {
  1: {
    stars: "★",
    starClass: "text-2xl text-yellow-400 sm:text-4xl",
    label: "1st Star",
    cardClass: "border-yellow-200/60 bg-yellow-50/30",
  },
  2: {
    stars: "★★",
    starClass: "text-lg text-slate-300 sm:text-2xl",
    label: "2nd Star",
    cardClass: "border-slate-200/60 bg-slate-50/30",
  },
  3: {
    stars: "★★★",
    starClass: "text-xs text-amber-700/70 sm:text-sm",
    label: "3rd Star",
    cardClass: "border-amber-200/50 bg-amber-50/20",
  },
} as const;

function StarPodiumCard({ star }: { star: StarPlayer }) {
  const config = STAR_RANK_CONFIG[star.starRank];
  const isGoalie = (star.posGroup as string) === "G";

  const statItems = isGoalie
    ? [
        { v: formatStatValue(star.W), l: "W" },
        { v: formatStatValue(star.GA), l: "GA" },
        { v: formatStatValue(star.SV), l: "SV" },
        { v: formatStatValue(star.SVP, 3), l: "SVP" },
        { v: formatStatValue(star.SO), l: "SO" },
      ]
    : [
        { v: formatStatValue(star.G), l: "G" },
        { v: formatStatValue(star.A), l: "A" },
        { v: formatStatValue(star.P), l: "P" },
        { v: formatStatValue(star.PPP), l: "PPP" },
        { v: formatStatValue(star.SOG), l: "SOG" },
        { v: formatStatValue(star.HIT), l: "HIT" },
      ];

  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg border p-1.5 text-center backdrop-blur-sm sm:gap-1 sm:rounded-2xl sm:p-3 ${config.cardClass}`}
    >
      <div className={`leading-none ${config.starClass}`}>{config.stars}</div>
      <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-400 sm:text-[10px]">
        {config.label}
      </div>
      <div className="mt-1 line-clamp-2 text-[10px] font-semibold leading-tight text-slate-800 sm:text-sm">
        {formatMatchupPlayerName(star)}
      </div>
      <div className="max-w-full truncate text-[9px] text-slate-400 sm:text-xs">
        {star.team?.abbr ?? star.team?.name ?? "—"} ·{" "}
        {formatMatchupPlayerPositions(star)}
      </div>
      <div className="mt-1 text-[10px] font-semibold text-slate-600 sm:text-xs">
        {formatStatValue(star.numericRating, 2)}
        <span className="ml-1 text-[8px] font-normal uppercase text-slate-400 sm:text-[10px]">
          Rating
        </span>
      </div>
      <div className="mt-0.5 hidden flex-wrap justify-center gap-x-1.5 gap-y-0.5 sm:flex sm:gap-x-2">
        {statItems.map(({ v, l }) => (
          <span key={l} className="text-[9px] text-slate-400 sm:text-[10px]">
            {v}
            <span className="ml-0.5 text-slate-300">{l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StarsCard({ stars }: { stars: StarPlayer[] }) {
  const firstStar = stars.find((s) => s.starRank === 1) ?? null;
  const secondStar = stars.find((s) => s.starRank === 2) ?? null;
  const thirdStar = stars.find((s) => s.starRank === 3) ?? null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="mb-2 sm:mb-4">
        <h2 className="font-oswald text-xl text-slate-900 sm:text-2xl">
          Three Stars
        </h2>
      </div>
      {stars.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No player performances available for this matchup yet.
        </div>
      ) : (
        <div className="grid grid-cols-3 items-start gap-1.5 sm:gap-2">
          <div className="min-w-0 pt-2 sm:pt-4">
            {secondStar ? (
              <StarPodiumCard star={secondStar} />
            ) : (
              <div className="h-full rounded-2xl border border-slate-100" />
            )}
          </div>
          <div className="min-w-0 pt-0">
            {firstStar ? (
              <StarPodiumCard star={firstStar} />
            ) : (
              <div className="h-full rounded-2xl border border-slate-100" />
            )}
          </div>
          <div className="min-w-0 pt-4 sm:pt-8">
            {thirdStar ? (
              <StarPodiumCard star={thirdStar} />
            ) : (
              <div className="h-full rounded-2xl border border-slate-100" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function MatchupDetailsContent({
  matchupId,
  seasonId,
  weekId,
}: MatchupDetailsContentProps) {
  const { data: nhlTeamsData = [] } = useNHLTeams();
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
  const [selectedSide, setSelectedSide] = useState<"away" | "home">("away");

  const homeTeam = matchup
    ? (findTeamById(scheduleData.teams, matchup.homeTeamId) ?? null)
    : null;
  const awayTeam = matchup
    ? (findTeamById(scheduleData.teams, matchup.awayTeamId) ?? null)
    : null;
  const { teamColor: awayTeamColor } = useTeamColor(awayTeam?.logoUrl);
  const { teamColor: homeTeamColor } = useTeamColor(homeTeam?.logoUrl);
  const homeTeamStats = matchup
    ? (scheduleData.teamWeekStatsByTeam[String(matchup.homeTeamId)] ?? null)
    : null;
  const awayTeamStats = matchup
    ? (scheduleData.teamWeekStatsByTeam[String(matchup.awayTeamId)] ?? null)
    : null;

  const matchupCategories = useMemo(
    () => resolveMatchupCategories(season?.categories),
    [season?.categories],
  );

  const categoryResults = useMemo<CategoryResult[]>(() => {
    if (!homeTeamStats || !awayTeamStats) return [];

    return buildCategoryResults(
      homeTeamStats,
      awayTeamStats,
      matchupCategories,
    );
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
    if (matchup.homeWin)
      return `${homeTeam?.name ?? "Home team"} won the matchup`;
    if (matchup.awayWin)
      return `${awayTeam?.name ?? "Away team"} won the matchup`;
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
      const ratingDelta =
        toStatNumber(right.Rating) - toStatNumber(left.Rating);
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
      const ratingDelta =
        toStatNumber(right.Rating) - toStatNumber(left.Rating);
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

  useEffect(() => {
    setSelectedSide("away");
  }, [matchupId]);

  const selectedTeam = selectedSide === "away" ? awayTeam : homeTeam;
  const selectedPlayers = selectedSide === "away" ? awayPlayers : homePlayers;

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
    return <MatchupSkeleton />;
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
    <main className="mx-auto max-w-6xl px-2 py-3 pb-20 sm:px-4 sm:py-8 lg:pb-10">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-6">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 underline-offset-4 shadow-sm hover:text-slate-900 hover:underline sm:px-3 sm:py-1.5 sm:text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <div className="line-clamp-2 text-right text-[9px] uppercase leading-tight tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
          {season?.name ?? "Season"}{" "}
          {gameDisplay ? `- ${gameDisplay.label}` : ""}
          {weekRange ? ` - ${weekRange}` : ""}
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-2 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="mb-2 border-b border-slate-200 pb-2 sm:mb-5 sm:pb-5">
          <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4">
            <MatchupSummaryTeam
              team={awayTeam}
              score={matchupScore.away}
              alignment="right"
            />
            <div className="text-center">
              <div className="font-oswald text-lg text-slate-800 sm:text-3xl">
                vs
              </div>
              <div className="mt-1 hidden max-w-24 text-[11px] leading-tight text-slate-500 sm:block sm:max-w-none sm:text-sm">
                {matchupStatus}
              </div>
            </div>
            <MatchupSummaryTeam
              team={homeTeam}
              score={matchupScore.home}
              alignment="left"
            />
          </div>
        </div>

        <div className="space-y-2 sm:space-y-4">
          <CategoryResultsCard
            title="Matchup Breakdown"
            categories={categoryResults}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
          />
          <StarsCard stars={stars} />
        </div>
      </section>

      <section className="mt-3 space-y-2 sm:mt-6 sm:space-y-4">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
          <div className="grid grid-cols-2">
            {[
              { side: "away" as const, team: awayTeam, label: "Away Team" },
              { side: "home" as const, team: homeTeam, label: "Home Team" },
            ].map(({ side, team, label }) => {
              const isSelected = selectedSide === side;
              const teamColor = side === "away" ? awayTeamColor : homeTeamColor;
              const base = teamColor ? lighten(teamColor, 0.82) : "#f8fafc";
              const textColor = readableText(base);
              const accent = teamColor ?? "#cbd5e1";

              return (
                <button
                  key={side}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedSide(side)}
                  className={[
                    "relative flex min-h-12 min-w-0 items-center justify-center gap-1.5 px-2 py-2 text-left transition-all sm:min-h-24 sm:gap-4 sm:px-4 sm:py-5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400",
                    side === "away" ? "border-r border-slate-200" : "",
                  ].join(" ")}
                  style={{
                    backgroundColor: base,
                    color: textColor,
                    borderColor: accent,
                    opacity: isSelected ? 1 : 0.68,
                    transform: isSelected ? "translateY(-1px)" : "none",
                    boxShadow: isSelected
                      ? `inset 0 0 0 3px ${accent}, 0 12px 24px -18px ${accent}`
                      : `inset 0 0 0 1px ${accent}33`,
                  }}
                >
                  {team?.logoUrl ? (
                    <Image
                      src={team.logoUrl}
                      alt={team.name ?? label}
                      width={48}
                      height={48}
                      className="h-7 w-7 shrink-0 object-contain sm:h-12 sm:w-12"
                      style={{
                        filter: isSelected ? "none" : "grayscale(0.15)",
                      }}
                    />
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/50 text-[10px] font-semibold sm:h-12 sm:w-12 sm:text-sm">
                      {team?.abbr?.slice(0, 3) ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-oswald text-sm leading-none sm:text-2xl">
                      {team?.name ?? label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <PlayerStatsTable
          team={selectedTeam}
          nhlTeams={nhlTeamsData as NHLTeam[]}
          players={selectedPlayers}
          seasonCategories={season?.categories}
        />
      </section>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { LoadingSpinner } from "@gshl-ui";
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
  return (
    <div
      className={`flex items-center gap-2 sm:gap-3 ${alignment === "right" ? "justify-end text-right" : "text-left"}`}
    >
      {alignment === "right" ? (
        <>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900 sm:text-lg">
              {team?.name ?? "Unknown Team"}
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
              {team?.ownerNickname ?? team?.confAbbr ?? "Team"}
            </div>
          </div>
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt={team.name ?? "Team Logo"}
              width={44}
              height={44}
              className="h-8 w-8 object-contain sm:h-11 sm:w-11"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 sm:h-11 sm:w-11 sm:text-sm">
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
              className="h-8 w-8 object-contain sm:h-11 sm:w-11"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 sm:h-11 sm:w-11 sm:text-sm">
              {team?.abbr?.slice(0, 3) ?? "?"}
            </div>
          )}
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900 sm:text-lg">
              {team?.name ?? "Unknown Team"}
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
              {team?.ownerNickname ?? team?.confAbbr ?? "Team"}
            </div>
          </div>
        </>
      )}
      <div className="min-w-8 font-oswald text-3xl text-slate-900 sm:min-w-12 sm:text-4xl">
        {score}
      </div>
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
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <h2 className="font-oswald text-xl text-slate-900 sm:text-2xl">
          {title}
        </h2>
        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
          Category Results
        </div>
      </div>
      {categories.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No category data available yet.
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
          <table className="min-w-max text-[11px] sm:w-full sm:text-sm">
            <tbody>
              <tr>
                <td className="sticky left-0 whitespace-nowrap bg-white pb-1 pr-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs">
                  {awayTeam?.abbr ?? awayTeam?.name ?? "Away"}
                </td>
                {categories.map((cat) => (
                  <td
                    key={cat.key}
                    className={`whitespace-nowrap px-1 pb-1 text-center text-[11px] sm:text-sm ${
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
                    <span className="inline-block whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:text-xs">
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
                    className={`whitespace-nowrap px-1 pt-1 text-center text-[11px] sm:text-sm ${
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
    starClass: "text-4xl text-yellow-400",
    label: "1st Star",
    cardClass: "border-yellow-200/60 bg-yellow-50/30",
  },
  2: {
    stars: "★★",
    starClass: "text-2xl text-slate-300",
    label: "2nd Star",
    cardClass: "border-slate-200/60 bg-slate-50/30",
  },
  3: {
    stars: "★★★",
    starClass: "text-sm text-amber-700/70",
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
      className={`flex flex-col items-center gap-0.5 rounded-xl border p-2 text-center backdrop-blur-sm sm:gap-1 sm:rounded-2xl sm:p-3 ${config.cardClass}`}
    >
      <div className={`leading-none ${config.starClass}`}>{config.stars}</div>
      <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-slate-400 sm:text-[10px]">
        {config.label}
      </div>
      <div className="mt-1 text-xs font-semibold leading-tight text-slate-800 sm:text-sm">
        {formatMatchupPlayerName(star)}
      </div>
      <div className="text-[10px] text-slate-400 sm:text-xs">
        {star.team?.abbr ?? star.team?.name ?? "—"} ·{" "}
        {formatMatchupPlayerPositions(star)}
      </div>
      <div className="mt-1 text-[11px] font-semibold text-slate-600 sm:text-xs">
        Rating {formatStatValue(star.numericRating, 2)}
      </div>
      <div className="mt-0.5 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5 sm:gap-x-2">
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
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <h2 className="font-oswald text-xl text-slate-900 sm:text-2xl">
          Three Stars
        </h2>
        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
          Ranked by weekly rating
        </div>
      </div>
      {stars.length === 0 ? (
        <div className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No player performances available for this matchup yet.
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
          <div className="flex min-w-[520px] items-start gap-2 sm:min-w-0">
            <div className="flex-1 pt-2 sm:pt-4">
              {secondStar ? (
                <StarPodiumCard star={secondStar} />
              ) : (
                <div className="h-full rounded-2xl border border-slate-100" />
              )}
            </div>
            <div className="flex-1 pt-0">
              {firstStar ? (
                <StarPodiumCard star={firstStar} />
              ) : (
                <div className="h-full rounded-2xl border border-slate-100" />
              )}
            </div>
            <div className="flex-1 pt-4 sm:pt-8">
              {thirdStar ? (
                <StarPodiumCard star={thirdStar} />
              ) : (
                <div className="h-full rounded-2xl border border-slate-100" />
              )}
            </div>
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
  const awayTeamColor = useTeamColor(awayTeam?.logoUrl);
  const homeTeamColor = useTeamColor(homeTeam?.logoUrl);
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
    <main className="mx-auto max-w-6xl px-3 py-5 pb-24 sm:px-4 sm:py-8 lg:pb-10">
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 underline-offset-4 shadow-sm hover:text-slate-900 hover:underline sm:text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <div className="text-right text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
          {season?.name ?? "Season"}{" "}
          {gameDisplay ? `- ${gameDisplay.label}` : ""}
          {weekRange ? ` - ${weekRange}` : ""}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-3 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:mb-5 sm:pb-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-xs sm:tracking-[0.22em]">
            Matchup Score
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
            <MatchupSummaryTeam
              team={awayTeam}
              score={matchupScore.away}
              alignment="right"
            />
            <div className="text-center">
              <div className="font-oswald text-2xl text-slate-800 sm:text-3xl">
                vs
              </div>
              <div className="mt-1 max-w-24 text-[11px] leading-tight text-slate-500 sm:max-w-none sm:text-sm">
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

        <div className="space-y-4">
          <CategoryResultsCard
            title="Matchup Breakdown"
            categories={categoryResults}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
          />
          <StarsCard stars={stars} />
        </div>
      </section>

      <section className="mt-5 space-y-3 sm:mt-6 sm:space-y-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
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
                    "relative flex min-h-16 items-center justify-center gap-2 px-3 py-3 text-left transition-all sm:min-h-24 sm:gap-4 sm:px-4 sm:py-5",
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
                      className="h-8 w-8 object-contain sm:h-12 sm:w-12"
                      style={{
                        filter: isSelected ? "none" : "grayscale(0.15)",
                      }}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 text-xs font-semibold sm:h-12 sm:w-12 sm:text-sm">
                      {team?.abbr?.slice(0, 3) ?? "?"}
                    </div>
                  )}
                  <div>
                    <div className="font-oswald text-lg leading-none sm:text-2xl">
                      {team?.name ?? label}
                    </div>
                    <div
                      className={[
                        "mt-1 text-[10px] font-medium uppercase tracking-[0.14em] sm:text-xs sm:tracking-[0.18em]",
                        isSelected ? "opacity-100" : "opacity-70",
                      ].join(" ")}
                    >
                      {side === "away" ? "Away" : "Home"}
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

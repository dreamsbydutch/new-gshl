"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { MatchupSkeleton } from "@gshl-skeletons";
import { TableViewport } from "@gshl-ui";
import {
  lighten,
  readableText,
  useAuthSession,
  useMatchupContextNavigation,
  useMatchupDetails,
  useTeamColor,
} from "@gshl-hooks";
import type {
  CategoryResult,
  MatchupDetailsContentProps,
  MatchupDetailsTeam,
  StarPlayer,
} from "@gshl-types";
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
import {
  buildWhatsAppShareMessage,
  canShareOwnerContent,
} from "@gshl-utils/features/whatsapp-share";
import { PlayerStatsTable } from "./PlayerStatsTable";
import { ArrowLeftIcon } from "lucide-react";

function MatchupSummaryTeam({
  team,
  score,
  alignment,
}: {
  team: MatchupDetailsTeam | null;
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
  homeTeam: MatchupDetailsTeam | null;
  awayTeam: MatchupDetailsTeam | null;
}) {
  const awayLabel = awayTeam?.abbr ?? awayTeam?.name ?? "Away";
  const homeLabel = homeTeam?.abbr ?? homeTeam?.name ?? "Home";
  const outcomeFor = (
    category: CategoryResult,
    side: "away" | "home",
  ): "Win" | "Loss" | "Tie" => {
    if (category.winner === "tie") return "Tie";
    return category.winner === side ? "Win" : "Loss";
  };
  const valueClassFor = (category: CategoryResult, side: "away" | "home") => {
    const outcome = outcomeFor(category, side);
    if (outcome === "Win") return "font-semibold text-emerald-700";
    if (outcome === "Tie") return "font-medium text-slate-700";
    return "text-slate-500";
  };

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
        <>
          <div className="lg:hidden">
            <div
              aria-hidden="true"
              className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] items-center gap-2 border-b border-slate-200 px-2 pb-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              <span className="truncate">{awayLabel}</span>
              <span>Category</span>
              <span className="truncate">{homeLabel}</span>
            </div>
            <dl>
              {categories.map((category) => {
                const awayOutcome = outcomeFor(category, "away");
                const homeOutcome = outcomeFor(category, "home");

                return (
                  <div
                    key={category.key}
                    className="grid min-h-14 grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 px-2 py-2 text-center last:border-0"
                  >
                    <dt className="col-start-2 row-start-1 rounded-md bg-slate-100 px-1.5 py-1 text-xs font-semibold text-slate-600">
                      {category.label}
                    </dt>
                    <dd
                      aria-label={`${awayLabel}: ${category.awayValue}, ${awayOutcome}`}
                      className={`col-start-1 row-start-1 flex flex-col items-center text-sm ${valueClassFor(category, "away")}`}
                    >
                      <span>{category.awayValue}</span>
                      <span className="mt-0.5 text-xs font-medium">
                        {awayOutcome}
                      </span>
                    </dd>
                    <dd
                      aria-label={`${homeLabel}: ${category.homeValue}, ${homeOutcome}`}
                      className={`col-start-3 row-start-1 flex flex-col items-center text-sm ${valueClassFor(category, "home")}`}
                    >
                      <span>{category.homeValue}</span>
                      <span className="mt-0.5 text-xs font-medium">
                        {homeOutcome}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <TableViewport
            ariaLabel={`${awayLabel} and ${homeLabel} matchup category comparison`}
            className="hidden lg:block"
            scrollHint="Scroll to compare every matchup category"
          >
            <table className="w-max min-w-full border-collapse text-sm">
              <caption className="sr-only">
                {awayLabel} and {homeLabel} matchup category comparison
              </caption>
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th
                    scope="col"
                    className="sticky left-0 z-30 min-w-24 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
                  >
                    Team
                  </th>
                  {categories.map((category) => (
                    <th
                      key={category.key}
                      scope="col"
                      className="min-w-14 whitespace-nowrap px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
                    >
                      {category.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    {
                      side: "away" as const,
                      label: awayLabel,
                      value: (category: CategoryResult) => category.awayValue,
                    },
                    {
                      side: "home" as const,
                      label: homeLabel,
                      value: (category: CategoryResult) => category.homeValue,
                    },
                  ] as const
                ).map((row) => (
                  <tr
                    key={row.side}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-20 bg-white px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      {row.label}
                    </th>
                    {categories.map((category) => {
                      const outcome = outcomeFor(category, row.side);
                      return (
                        <td
                          key={category.key}
                          className={`whitespace-nowrap px-2 py-3 text-center ${valueClassFor(category, row.side)}`}
                        >
                          {row.value(category)}
                          <span className="sr-only">, {outcome}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableViewport>
        </>
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
  const isGoalie = star.posGroup === "G";

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
}: MatchupDetailsContentProps) {
  const { session } = useAuthSession();
  const matchupQuery = useMatchupDetails(matchupId);
  const details = matchupQuery.data;
  const matchup = details?.matchup ?? null;
  const season = details?.season ?? null;
  const week = details?.week ?? null;
  const homeTeam = details?.teams.home ?? null;
  const awayTeam = details?.teams.away ?? null;
  const homeTeamStats = details?.teamStats.home ?? null;
  const awayTeamStats = details?.teamStats.away ?? null;
  const matchupNavigation = useMatchupContextNavigation(
    matchup?.seasonId ?? "",
    matchup?.weekId ?? "",
  );
  const teamLookup = useMemo(() => {
    return new Map(
      [homeTeam, awayTeam]
        .filter((team): team is MatchupDetailsTeam => Boolean(team))
        .map((team) => [String(team.id), team]),
    );
  }, [awayTeam, homeTeam]);
  const selectedSide = matchupNavigation.selectedSide;

  const { teamColor: awayTeamColor } = useTeamColor(awayTeam?.logoUrl);
  const { teamColor: homeTeamColor } = useTeamColor(homeTeam?.logoUrl);

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
  const matchupShareMessage = buildWhatsAppShareMessage({
    title: "GSHL Matchup",
    summary: `${awayTeam?.name ?? "Away team"} ${matchupScore.away} - ${matchupScore.home} ${homeTeam?.name ?? "Home team"}`,
    lines: [
      matchupStatus,
      `${season?.name ?? "Season"}${week ? ` · Week ${week.weekNum}` : ""}`,
    ],
  });

  const homePlayers = useMemo(() => {
    const players = details?.players.home ?? [];

    return [...players].sort((left, right) => {
      const ratingDelta =
        toStatNumber(right.Rating) - toStatNumber(left.Rating);
      if (ratingDelta !== 0) return ratingDelta;
      return formatMatchupPlayerName(left).localeCompare(
        formatMatchupPlayerName(right),
      );
    });
  }, [details?.players.home]);

  const awayPlayers = useMemo(() => {
    const players = details?.players.away ?? [];

    return [...players].sort((left, right) => {
      const ratingDelta =
        toStatNumber(right.Rating) - toStatNumber(left.Rating);
      if (ratingDelta !== 0) return ratingDelta;
      return formatMatchupPlayerName(left).localeCompare(
        formatMatchupPlayerName(right),
      );
    });
  }, [details?.players.away]);

  const stars = useMemo(
    () => getStarPlayers([...awayPlayers, ...homePlayers], teamLookup),
    [awayPlayers, homePlayers, teamLookup],
  );

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

  if (matchupQuery.isLoading) {
    return <MatchupSkeleton />;
  }

  if (matchupQuery.error) {
    return (
      <main
        aria-labelledby="matchup-error-heading"
        className="mx-auto max-w-3xl px-4 py-10"
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <h1 id="matchup-error-heading" className="text-xl font-bold">
            Matchup unavailable
          </h1>
          <p className="mt-2">Couldn&apos;t load this matchup right now.</p>
        </div>
      </main>
    );
  }

  if (!matchup) {
    return (
      <main
        aria-labelledby="matchup-not-found-heading"
        className="mx-auto max-w-3xl px-4 py-10"
      >
        <div className="border-y border-slate-200 py-6 text-slate-600">
          <h1
            id="matchup-not-found-heading"
            className="text-xl font-bold text-slate-900"
          >
            Matchup not found
          </h1>
          <p className="mt-2">Matchup details were not found for this week.</p>
        </div>
      </main>
    );
  }

  return (
    <main
      aria-labelledby="matchup-page-heading"
      className="mx-auto max-w-6xl px-2 py-3 sm:px-4 sm:py-5"
    >
      <h1 id="matchup-page-heading" className="sr-only">
        {awayTeam?.name ?? "Away team"} at {homeTeam?.name ?? "Home team"}
      </h1>
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-6">
        <Link
          href={matchupNavigation.backHref}
          className="hidden min-h-11 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 underline-offset-4 shadow-sm hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 lg:inline-flex lg:text-sm"
        >
          <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />
          {matchupNavigation.backLabel}
        </Link>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          {canShareOwnerContent(session?.user.role) ? (
            <WhatsAppShareButton
              message={matchupShareMessage}
              path={`/matchup/${encodeURIComponent(matchupId)}`}
              label="Share matchup"
              className="shrink-0"
            />
          ) : null}
          <div className="line-clamp-2 text-right text-[9px] uppercase leading-tight tracking-[0.12em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
            {season?.name ?? "Season"}{" "}
            {gameDisplay ? `- ${gameDisplay.label}` : ""}
            {weekRange ? ` - ${weekRange}` : ""}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 p-2 sm:p-4">
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
          <p className="mt-2 text-center text-xs leading-tight text-slate-600 sm:hidden">
            {matchupStatus}
          </p>
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
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div
            role="tablist"
            aria-label="Select a team for player statistics"
            className="grid grid-cols-2"
          >
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
                  id={`matchup-${side}-players-tab`}
                  type="button"
                  role="tab"
                  aria-controls="matchup-player-statistics-panel"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => matchupNavigation.selectSide(side)}
                  onKeyDown={(event) => {
                    const nextSide =
                      event.key === "ArrowLeft" || event.key === "Home"
                        ? "away"
                        : event.key === "ArrowRight" || event.key === "End"
                          ? "home"
                          : null;
                    if (!nextSide) return;
                    event.preventDefault();
                    matchupNavigation.selectSide(nextSide);
                    document
                      .getElementById(`matchup-${nextSide}-players-tab`)
                      ?.focus();
                  }}
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

        <div
          id="matchup-player-statistics-panel"
          role="tabpanel"
          aria-labelledby={`matchup-${selectedSide}-players-tab`}
        >
          <PlayerStatsTable
            team={selectedTeam}
            nhlTeams={details?.nhlTeams ?? []}
            players={selectedPlayers}
            seasonCategories={season?.categories}
          />
        </div>
      </section>
    </main>
  );
}

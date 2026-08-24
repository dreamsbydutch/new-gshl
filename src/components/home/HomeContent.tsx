"use client";

import { MockDraftPreview } from "@gshl-components/draft/DraftBoardList";
import { useSeasonState } from "@gshl-hooks";
import { HomeSkeleton } from "@gshl-skeletons";
import {
  cn,
  findOffseasonWindow,
  isBetweenSeasons,
  resolveDraftHubSeason,
} from "@gshl-utils";
import { LeagueActivityCard } from "./LeagueActivityCard";
import { PowerRankingsHomeCard } from "./PowerRankingsHomeCard";
import { UfaHomeCard } from "@gshl-components/contracts";
import { WeeklyEditionHomeCard } from "@gshl-components/headlines/WeeklyEditionHomeCard";
import { DraftHubCard } from "./DraftHubCard";
import { OwnerCommandCenter } from "./OwnerCommandCenter";

export function HomeContent() {
  const { seasons, selectedSeason, currentSeason, defaultSeason, isLoading } =
    useSeasonState();

  if (isLoading) {
    return <HomeSkeleton />;
  }

  const offseasonWindow = findOffseasonWindow(seasons);
  const showOffseasonContent = isBetweenSeasons(seasons);
  const draftSeason = resolveDraftHubSeason(seasons);
  const dashboardSeason = selectedSeason ?? currentSeason ?? defaultSeason;

  return (
    <main
      aria-labelledby="home-dashboard-heading"
      className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-5 sm:py-5"
    >
      <h1 id="home-dashboard-heading" className="sr-only">
        GSHL league dashboard
      </h1>
      <div className="space-y-3 sm:space-y-4 lg:space-y-5">
        <OwnerCommandCenter />
        <WeeklyEditionHomeCard />
        <UfaHomeCard />
        <div
          className={cn(
            "mx-auto grid w-full min-w-0 max-w-5xl items-start gap-3 sm:gap-4",
            dashboardSeason && "xl:grid-cols-2",
          )}
        >
          {dashboardSeason ? (
            <PowerRankingsHomeCard seasonId={String(dashboardSeason.id)} />
          ) : null}
          <LeagueActivityCard
            seasonId={
              dashboardSeason?.id ? String(dashboardSeason.id) : undefined
            }
          />
        </div>
        {draftSeason?.draftStartAt ? (
          <div className="mx-auto w-full max-w-5xl">
            <DraftHubCard season={draftSeason} />
          </div>
        ) : null}
        {showOffseasonContent && offseasonWindow ? (
          <div className="mx-auto w-full max-w-5xl">
            <MockDraftPreview
              seasonId={String(offseasonWindow.upcomingSeason.id)}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}

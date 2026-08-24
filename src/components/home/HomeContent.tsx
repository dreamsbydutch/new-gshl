"use client";

import { MockDraftPreview } from "@gshl-components/draft/DraftBoardList";
import { useSeasonState } from "@gshl-hooks";
import { HomeSkeleton } from "@gshl-skeletons";
import {
  findOffseasonWindow,
  isBetweenSeasons,
  resolveDraftHubSeason,
} from "@gshl-utils";
import { LeagueWire } from "./LeagueWire";
import { UfaHomeCard } from "@gshl-components/contracts";
import { DraftHubCard } from "./DraftHubCard";

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
        <div className="-mx-3 w-[calc(100%+1.5rem)] min-w-0 sm:mx-auto sm:w-full sm:max-w-6xl">
          <LeagueWire
            seasonId={
              dashboardSeason?.id ? String(dashboardSeason.id) : undefined
            }
          />
        </div>
        <UfaHomeCard />
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

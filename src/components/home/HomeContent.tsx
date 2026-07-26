"use client";

import { MockDraftPreview } from "@gshl-components/draft/DraftBoardList";
import { useSeasonState } from "@gshl-hooks";
import { HomeSkeleton } from "@gshl-skeletons";
import { findOffseasonWindow, isBetweenSeasons } from "@gshl-utils";
import { LeagueActivityCard } from "./LeagueActivityCard";
import { PowerRankingsHomeCard } from "./PowerRankingsHomeCard";
import { UfaHomeCard } from "@gshl-components/contracts";
import { WeeklyEditionHomeCard } from "@gshl-components/headlines/WeeklyEditionHomeCard";

export function HomeContent() {
  const { seasons, defaultSeason, isLoading } = useSeasonState();

  if (isLoading) {
    return <HomeSkeleton />;
  }

  const offseasonWindow = findOffseasonWindow(seasons);
  const showOffseasonContent = isBetweenSeasons(seasons);

  return (
    <main className="container mx-auto space-y-8 px-2 py-4 sm:px-4">
      <WeeklyEditionHomeCard
        seasonId={defaultSeason?.id ? String(defaultSeason.id) : undefined}
      />
      <UfaHomeCard />
      <PowerRankingsHomeCard
        seasonId={defaultSeason?.id ? String(defaultSeason.id) : undefined}
      />
      <LeagueActivityCard
        seasonId={defaultSeason?.id ? String(defaultSeason.id) : undefined}
      />
      {showOffseasonContent && offseasonWindow ? (
        <MockDraftPreview
          seasonId={String(offseasonWindow.upcomingSeason.id)}
        />
      ) : null}
    </main>
  );
}

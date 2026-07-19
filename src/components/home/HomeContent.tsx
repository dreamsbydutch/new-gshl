"use client";

import { MockDraftPreview } from "@gshl-components/draft/DraftBoardList";
import { useSeasonState } from "@gshl-hooks";
import { findOffseasonWindow, isBetweenSeasons } from "@gshl-utils";
import { LeagueActivityCard } from "./LeagueActivityCard";

export function HomeContent() {
  const { seasons, defaultSeason, isLoading } = useSeasonState();

  if (isLoading) {
    return <main className="container mx-auto space-y-6 px-4 py-8" />;
  }

  const offseasonWindow = findOffseasonWindow(seasons);
  const showOffseasonContent = isBetweenSeasons(seasons);

  return (
    <main className="container mx-auto space-y-8 px-2 py-4 sm:px-4">
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

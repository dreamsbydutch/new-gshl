"use client";

import { MockDraftPreview } from "@gshl-components/draft/DraftBoardList";
import { useSeasonState } from "@gshl-hooks";
import { findOffseasonWindow, isBetweenSeasons } from "@gshl-utils";

export function HomeContent() {
  const { seasons, isLoading } = useSeasonState();

  if (isLoading) {
    return <main className="container mx-auto space-y-6 px-4 py-8" />;
  }

  const offseasonWindow = findOffseasonWindow(seasons);
  const showOffseasonContent = isBetweenSeasons(seasons);

  return (
    <main className="container mx-auto py-4">
      {showOffseasonContent && offseasonWindow ? (
        <MockDraftPreview
          seasonId={String(offseasonWindow.upcomingSeason.id)}
        />
      ) : null}
    </main>
  );
}

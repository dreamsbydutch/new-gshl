"use client";

import { MockDraft } from "@gshl-components/draft";
import { useSeasonState } from "@gshl-hooks";
import { MockDraftSkeleton } from "@gshl-skeletons";
import { findMockDraftSeason } from "@gshl-utils";

export function LeagueOfficeMockDraft() {
  const { seasons, isLoading } = useSeasonState();
  const upcomingSeason = findMockDraftSeason(seasons);

  if (isLoading) {
    return <MockDraftSkeleton />;
  }

  if (!upcomingSeason) {
    return (
      <section className="gshl-page" aria-labelledby="mock-draft-heading">
        <h2 id="mock-draft-heading" className="gshl-section-title">
          Mock draft
        </h2>
        <p className="py-2 text-sm text-slate-500">
          The next mock draft is not available yet.
        </p>
      </section>
    );
  }

  return <MockDraft seasonId={String(upcomingSeason.id)} />;
}

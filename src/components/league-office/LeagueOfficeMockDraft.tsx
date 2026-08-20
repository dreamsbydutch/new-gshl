"use client";

import { MockDraft } from "@gshl-components/draft";
import { useSeasonState } from "@gshl-hooks";
import { MockDraftSkeleton } from "@gshl-skeletons";
import { findOffseasonWindow } from "@gshl-utils";

export function LeagueOfficeMockDraft() {
  const { seasons, isLoading } = useSeasonState();
  const upcomingSeason = findOffseasonWindow(seasons)?.upcomingSeason;

  if (isLoading) {
    return <MockDraftSkeleton />;
  }

  if (!upcomingSeason) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
        <h2 className="font-oswald text-2xl text-slate-950">GSHL Mock Draft</h2>
        <p className="mt-2 text-sm text-slate-500">
          The next mock draft is not available yet.
        </p>
      </div>
    );
  }

  return <MockDraft seasonId={String(upcomingSeason.id)} />;
}

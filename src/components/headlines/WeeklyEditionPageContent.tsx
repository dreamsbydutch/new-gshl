"use client";

import { useWeeklyEdition } from "@gshl-hooks";
import type { WeeklyEditionPageProps } from "@gshl-types";
import { Skeleton } from "@gshl-ui";
import { WeeklyEditionArticle } from "./WeeklyEditionArticle";

export function WeeklyEditionPageContent({
  editionId,
}: WeeklyEditionPageProps) {
  const { data: edition, isLoading } = useWeeklyEdition(editionId);

  if (isLoading) {
    return (
      <main className="container mx-auto px-3 py-6 sm:px-5">
        <Skeleton className="mx-auto h-[42rem] max-w-5xl rounded-2xl" />
      </main>
    );
  }

  if (!edition) {
    return (
      <main className="container mx-auto px-3 py-12 text-center sm:px-5">
        <h1 className="font-oswald text-4xl text-slate-950">
          Edition not found
        </h1>
        <p className="mt-2 text-slate-500">
          This issue may be hidden or may not have been published.
        </p>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-3 py-6 sm:px-5 sm:py-10">
      <WeeklyEditionArticle edition={edition} />
    </main>
  );
}

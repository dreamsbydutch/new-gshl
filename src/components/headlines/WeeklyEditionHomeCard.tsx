"use client";

import { ArrowRight, Newspaper } from "lucide-react";
import { useAppRouter, useLatestWeeklyEdition } from "@gshl-hooks";
import type { WeeklyEditionHomeCardProps } from "@gshl-types";
import { Skeleton } from "@gshl-ui";

export function WeeklyEditionHomeCard({
  seasonId,
}: WeeklyEditionHomeCardProps) {
  const { router } = useAppRouter();
  const { data: edition, isLoading } = useLatestWeeklyEdition(seasonId);

  if (isLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-12 w-4/5" />
        <Skeleton className="mt-3 h-5 w-full" />
      </section>
    );
  }
  if (!edition) return null;

  const hero = edition.facts.matchups.find(
    (matchup) => matchup.matchupId === edition.facts.heroMatchupId,
  );
  const secondary = edition.content.sections.slice(1, 4);

  return (
    <section className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-300 bg-[#fffdf7] shadow-sm">
      <header className="flex items-center justify-between gap-4 border-b-4 border-double border-slate-900 px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-slate-950 p-2 text-white">
            <Newspaper className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-oswald text-2xl font-bold uppercase tracking-tight text-slate-950">
              GSHL Weekly
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {edition.seasonName} · {edition.issueLabel}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/headlines")}
          className="text-xs font-semibold text-slate-600 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Archive
        </button>
      </header>

      <div className="grid lg:grid-cols-[1.65fr_1fr]">
        <button
          type="button"
          onClick={() => router.push(`/headlines/${edition.id}`)}
          className="group p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:p-7"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-700">
            This week’s lead
          </p>
          <h2 className="mt-3 font-oswald text-4xl font-bold leading-[1.05] text-slate-950 transition group-hover:text-blue-800 sm:text-5xl">
            {edition.content.headline}
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-slate-600">
            {edition.content.deck}
          </p>
          {hero ? (
            <div className="mt-5 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-3 font-oswald text-lg font-semibold text-slate-900">
              {hero.awayTeamName} {hero.awayScore}–{hero.homeScore}{" "}
              {hero.homeTeamName}
            </div>
          ) : null}
          <span className="mt-6 flex items-center gap-2 text-sm font-bold text-blue-700">
            Read the full issue
            <ArrowRight
              className="h-4 w-4 transition group-hover:translate-x-1"
              aria-hidden="true"
            />
          </span>
        </button>

        <div className="border-t border-slate-300 bg-white/60 px-5 py-2 lg:border-l lg:border-t-0">
          {secondary.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() =>
                router.push(`/headlines/${edition.id}#${story.id}`)
              }
              className="block w-full border-b border-slate-200 py-4 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-700">
                {story.eyebrow}
              </span>
              <span className="mt-1 block font-oswald text-xl font-semibold leading-tight text-slate-900 hover:text-blue-800">
                {story.headline}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

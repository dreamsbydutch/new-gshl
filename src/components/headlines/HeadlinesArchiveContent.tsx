"use client";

import { ArrowRight, Newspaper } from "lucide-react";
import { useAppRouter, useWeeklyEditionArchive } from "@gshl-hooks";
import { Skeleton } from "@gshl-ui";

export function HeadlinesArchiveContent() {
  const { router } = useAppRouter();
  const { data: editions, isLoading } = useWeeklyEditionArchive();

  return (
    <main className="container mx-auto px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-y-4 border-double border-slate-900 py-7 text-center">
          <Newspaper
            className="mx-auto h-6 w-6 text-blue-700"
            aria-hidden="true"
          />
          <h1 className="mt-2 font-oswald text-5xl font-bold uppercase tracking-tight text-slate-950 sm:text-7xl">
            GSHL Weekly
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Results, movement, transactions and the occasional gentle chirp
          </p>
        </header>

        {isLoading ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : editions?.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {editions.map((edition, index) => (
              <button
                key={edition.id}
                type="button"
                onClick={() => router.push(`/headlines/${edition.id}`)}
                className={`group rounded-xl border border-slate-300 bg-[#fffdf7] p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  index === 0 ? "sm:p-7 md:col-span-2" : ""
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">
                  {edition.seasonName} · {edition.issueLabel}
                </p>
                <h2
                  className={`mt-3 font-oswald font-bold leading-tight text-slate-950 group-hover:text-blue-800 ${
                    index === 0 ? "text-4xl sm:text-5xl" : "text-3xl"
                  }`}
                >
                  {edition.content.headline}
                </h2>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                  {edition.content.deck}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-blue-700">
                  Open issue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="font-oswald text-2xl text-slate-900">
              The presses are warming up
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              The first edition publishes after a completed week has all of its
              statistics.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { useWeeklyEditionArchive } from "@gshl-hooks";
import { Skeleton } from "@gshl-ui";

export function HeadlinesArchiveContent() {
  const { data: editions, isLoading } = useWeeklyEditionArchive();

  return (
    <main className="container mx-auto px-3 py-5 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-5 py-6 text-white shadow-lg shadow-slate-950/10 sm:px-7 sm:py-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
            <Newspaper className="h-4 w-4" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-oswald text-3xl font-bold uppercase tracking-tight sm:text-4xl">
            GSHL Press Box
          </h1>
          <p className="mt-2 max-w-lg text-xs font-semibold uppercase leading-5 tracking-[0.12em] text-slate-200">
            Results, movement, transactions and the occasional gentle chirp
          </p>
        </header>

        {isLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : editions?.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {editions.map((edition, index) => (
              <Link
                key={edition.id}
                href={`/headlines/${edition.id}`}
                className={`group block rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none ${
                  index === 0 ? "sm:col-span-2 sm:p-5" : ""
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">
                  {edition.seasonName} · {edition.issueLabel}
                </p>
                <h2
                  className={`mt-2 font-oswald font-bold leading-tight text-slate-950 group-hover:text-blue-800 ${
                    index === 0 ? "text-2xl sm:text-3xl" : "text-xl"
                  }`}
                >
                  {edition.content.headline}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                  {edition.content.deck}
                </p>
                <span className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-blue-700">
                  Open issue
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="font-oswald text-xl text-slate-900">
              The presses are warming up
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The first edition publishes after a completed week has all of its
              statistics.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

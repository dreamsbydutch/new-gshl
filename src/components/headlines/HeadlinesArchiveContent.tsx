"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useWeeklyEditionArchive } from "@gshl-hooks";
import { Skeleton } from "@gshl-ui";
import { WEEKLY_EDITION_LOGO_URL } from "@gshl-utils";

export function HeadlinesArchiveContent() {
  const { data: editions, isLoading } = useWeeklyEditionArchive();

  return (
    <main className="container mx-auto px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center gap-3 border-b border-slate-300 pb-3">
          <Image
            src={WEEKLY_EDITION_LOGO_URL}
            alt="GSHL Press Box"
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 object-contain"
          />
          <div>
            <h1 className="font-oswald text-2xl font-bold uppercase tracking-tight sm:text-3xl">
              Press Box
            </h1>
            <p className="text-xs text-slate-500">News and league updates</p>
          </div>
        </header>

        {isLoading ? (
          <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
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
                className={`group block px-1 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1 motion-reduce:transition-none ${index === 0 ? "sm:py-4" : ""}`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {edition.seasonName} · {edition.issueLabel}
                </p>
                <h2
                  className={`mt-2 font-oswald font-bold leading-tight text-slate-950 group-hover:text-blue-800 ${
                    index === 0 ? "text-2xl sm:text-3xl" : "text-xl"
                  }`}
                >
                  {edition.headline}
                </h2>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
                  {edition.deck}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-700">
                  Read
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 border-y border-dashed border-slate-300 py-6 text-center">
            <h2 className="font-oswald text-xl text-slate-900">
              No editions yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The first edition follows a completed week.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

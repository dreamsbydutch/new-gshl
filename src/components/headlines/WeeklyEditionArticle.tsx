"use client";

import { ArrowLeft, CalendarDays } from "lucide-react";
import { useAppRouter } from "@gshl-hooks";
import type { WeeklyEditionArticleProps } from "@gshl-types";
import { formatDisplayDate } from "@gshl-utils";
import { WeeklyEditionSectionCard } from "./WeeklyEditionSectionCard";

export function WeeklyEditionArticle({
  edition,
  preview = false,
}: WeeklyEditionArticleProps) {
  const { router } = useAppRouter();
  const [lead, ...sections] = edition.content.sections;

  return (
    <article className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-[#fffdf7] shadow-sm">
      <header className="border-b-4 border-double border-slate-900 px-5 py-5 sm:px-10 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-400 pb-3 text-xs text-slate-600">
          <button
            type="button"
            onClick={() => router.push("/headlines")}
            className="inline-flex items-center gap-1.5 font-semibold hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All editions
          </button>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {edition.issueType === "weekly"
              ? `${formatDisplayDate(new Date(edition.startDate))} to ${formatDisplayDate(new Date(edition.endDate))}`
              : `Published for ${formatDisplayDate(new Date(edition.scheduledFor))}`}
          </span>
        </div>
        <div className="py-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-blue-700">
            {preview ? "Newsroom Preview" : edition.seasonName}
          </p>
          <p className="mt-2 font-oswald text-4xl font-bold uppercase tracking-tight text-slate-950 sm:text-6xl">
            GSHL Weekly
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {edition.issueLabel} · The league’s newspaper
          </p>
        </div>
      </header>

      <div className="px-5 py-7 sm:px-10 sm:py-10">
        <h1 className="max-w-4xl font-oswald text-4xl font-bold leading-[1.05] text-slate-950 sm:text-6xl">
          {edition.content.headline}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
          {edition.content.deck}
        </p>

        {lead ? (
          <div className="mt-8">
            <WeeklyEditionSectionCard section={lead} featured />
          </div>
        ) : null}

        <div className="mt-8 grid gap-x-8 gap-y-7 lg:grid-cols-2">
          {sections.map((section) => (
            <WeeklyEditionSectionCard key={section.id} section={section} />
          ))}
        </div>
      </div>

      <footer className="border-t border-slate-300 bg-white/60 px-5 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        Facts verified from GSHL weekly results · Copy may be template,
        imported, or manually edited
      </footer>
    </article>
  );
}

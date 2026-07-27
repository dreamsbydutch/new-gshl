"use client";

import Image from "next/image";
import { ArrowLeft, CalendarDays, Newspaper, X } from "lucide-react";
import { useAppRouter } from "@gshl-hooks";
import type { WeeklyEditionArticleProps } from "@gshl-types";
import { formatDisplayDate } from "@gshl-utils";
import { WeeklyEditionSectionCard } from "./WeeklyEditionSectionCard";

export function WeeklyEditionArticle({
  edition,
  preview = false,
  modal = false,
  onClose,
}: WeeklyEditionArticleProps) {
  const { router } = useAppRouter();
  const [firstPrimary, secondPrimary, ...standardArticles] =
    edition.content.sections;
  const primaryArticles = [firstPrimary, secondPrimary].filter(
    (section) => section !== undefined,
  );
  const conferenceMarks = edition.facts.teams
    .flatMap((team) =>
      team.conferenceLogoUrl
        ? [{ ...team, conferenceLogoUrl: team.conferenceLogoUrl }]
        : [],
    )
    .filter(
      (team, index, teams) =>
        teams.findIndex(
          (candidate) => candidate.conferenceId === team.conferenceId,
        ) === index,
    )
    .slice(0, 2);

  return (
    <article
      className={`mx-auto overflow-hidden bg-white ${
        modal
          ? "min-h-full max-w-4xl"
          : "max-w-4xl rounded-2xl border border-slate-200 shadow-sm"
      }`}
    >
      <header className="border-b border-slate-200 bg-white">
        <div
          className={`z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-2 text-[10px] text-slate-500 backdrop-blur ${
            modal ? "sticky top-0" : ""
          }`}
        >
          {modal ? (
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close newsletter"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/headlines")}
              className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Editions
            </button>
          )}
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {edition.issueType === "weekly"
                ? `${formatDisplayDate(new Date(edition.startDate))} to ${formatDisplayDate(new Date(edition.endDate))}`
                : `Published for ${formatDisplayDate(new Date(edition.scheduledFor))}`}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
              <Newspaper className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-oswald text-lg font-bold uppercase leading-none tracking-tight text-slate-950">
                GSHL Press Box
              </p>
              <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">
                {preview ? "Newsroom preview" : edition.seasonName} ·{" "}
                {edition.issueLabel}
              </p>
            </div>
          </div>
          {conferenceMarks.length > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              {conferenceMarks.map((team) => (
                <span
                  key={team.conferenceId}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1"
                  title={team.conferenceName}
                >
                  <Image
                    src={team.conferenceLogoUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                  />
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-700">
          The lead
        </p>
        <h1 className="mt-2 max-w-2xl font-oswald text-2xl font-bold leading-[1.05] tracking-tight text-slate-950 sm:text-3xl">
          {edition.content.headline}
        </h1>
        <p className="mt-2.5 max-w-2xl text-[13px] leading-5 text-slate-600">
          {edition.content.deck}
        </p>

        {primaryArticles.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {primaryArticles.map((section) => (
              <WeeklyEditionSectionCard
                key={section.id}
                section={section}
                featured
                teams={edition.facts.teams}
              />
            ))}
          </div>
        ) : null}

        {standardArticles.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {standardArticles.map((section) => (
              <WeeklyEditionSectionCard
                key={section.id}
                section={section}
                teams={edition.facts.teams}
              />
            ))}
          </div>
        ) : null}
        {primaryArticles.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="text-[11px] font-semibold text-slate-500">
              No articles are currently active in this issue.
            </p>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Verified from GSHL results · Template, imported, or edited copy
      </footer>
    </article>
  );
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, BookOpen } from "lucide-react";
import { useAppRouter, useLatestWeeklyEdition } from "@gshl-hooks";
import { Skeleton } from "@gshl-ui";
import { WEEKLY_EDITION_LOGO_URL } from "@gshl-utils";
import { WeeklyEditionArticle } from "./WeeklyEditionArticle";

export function WeeklyEditionHomeCard() {
  const { router } = useAppRouter();
  const { data: edition, isLoading } = useLatestWeeklyEdition();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (isLoading) {
    return (
      <section className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </section>
    );
  }
  if (!edition) return null;

  const hero = edition.facts.matchups.find(
    (matchup) => matchup.matchupId === edition.facts.heroMatchupId,
  );
  const heroTeams = hero
    ? [
        edition.facts.teams.find((team) => team.teamId === hero.awayTeamId),
        edition.facts.teams.find((team) => team.teamId === hero.homeTeamId),
      ].flatMap((team) =>
        team?.logoUrl ? [{ ...team, logoUrl: team.logoUrl }] : [],
      )
    : [];

  return (
    <>
      <section className="mx-auto flex w-full max-w-5xl items-stretch overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-lg shadow-slate-950/10">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 sm:px-4"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-inner">
            <Image
              src={WEEKLY_EDITION_LOGO_URL}
              alt=""
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              New from the Press Box
              <span className="text-slate-500">·</span>
              <span className="truncate text-slate-400">
                {edition.issueLabel}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[13px] font-semibold leading-5 text-white sm:text-sm">
              {edition.content.headline}
            </span>
          </span>
          {heroTeams.length > 0 ? (
            <span className="hidden shrink-0 items-center -space-x-1 sm:flex">
              {heroTeams.map((team) => (
                <span
                  key={team.teamId}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-white p-1"
                >
                  <Image
                    src={team.logoUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 object-contain"
                  />
                </span>
              ))}
            </span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-slate-950 transition group-hover:bg-cyan-100">
            Read
            <BookOpen className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/headlines")}
          className="hidden shrink-0 items-center gap-1 border-l border-slate-800 px-3 text-[10px] font-semibold text-slate-400 transition hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 sm:flex"
        >
          Archive
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </section>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm sm:p-3"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${edition.issueLabel}: ${edition.content.headline}`}
            className="h-full overflow-y-auto bg-slate-100 sm:mx-auto sm:max-w-4xl sm:rounded-3xl sm:shadow-2xl"
          >
            <WeeklyEditionArticle
              edition={edition}
              modal
              onClose={() => setIsOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

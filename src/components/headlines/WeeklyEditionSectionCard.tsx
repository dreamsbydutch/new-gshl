"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { useAppRouter } from "@gshl-hooks";
import type { WeeklyEditionSectionCardProps } from "@gshl-types";
import { getWeeklyEditionFallbackAuthor } from "@gshl-utils";

export function WeeklyEditionSectionCard({
  section,
  featured = false,
  teams = [],
}: WeeklyEditionSectionCardProps) {
  const { router } = useAppRouter();
  const author = section.author ?? getWeeklyEditionFallbackAuthor(section.kind);
  const storyText = `${section.headline} ${section.body}`.toLowerCase();
  const teamMarks = teams
    .flatMap((team) =>
      team.logoUrl && storyText.includes(team.name.toLowerCase())
        ? [{ ...team, logoUrl: team.logoUrl }]
        : [],
    )
    .slice(0, 2);
  const conferenceMarks = teamMarks
    .flatMap((team) =>
      team.conferenceLogoUrl
        ? [{ ...team, conferenceLogoUrl: team.conferenceLogoUrl }]
        : [],
    )
    .filter(
      (team, index, matches) =>
        matches.findIndex(
          (candidate) => candidate.conferenceId === team.conferenceId,
        ) === index,
    )
    .slice(0, 1);

  return (
    <section
      id={section.id}
      className={
        featured
          ? "flex h-full flex-col rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4 text-white shadow-lg shadow-slate-950/10 sm:p-5"
          : "flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-[8px] font-bold uppercase tracking-[0.18em] ${
            featured ? "text-cyan-300" : "text-blue-700"
          }`}
        >
          {section.eyebrow}
        </p>
        {teamMarks.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {conferenceMarks.map((team) => (
              <span
                key={`conference-${team.conferenceId}`}
                className={`flex h-5 w-5 items-center justify-center rounded-md p-0.5 ${
                  featured ? "bg-white/10" : "bg-slate-200/70"
                }`}
                title={team.conferenceName}
              >
                <Image
                  src={team.conferenceLogoUrl}
                  alt=""
                  width={14}
                  height={14}
                  className="h-3.5 w-3.5 object-contain"
                />
              </span>
            ))}
            {teamMarks.map((team) => (
              <span
                key={team.teamId}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white p-0.5 shadow-sm"
                title={team.name}
              >
                <Image
                  src={team.logoUrl}
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] object-contain"
                />
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <h2
        className={`mt-1.5 font-oswald font-semibold leading-tight ${
          featured
            ? "text-xl text-white sm:text-2xl"
            : "text-base text-slate-950"
        }`}
      >
        {section.headline}
      </h2>
      <p className="mt-1.5 text-[8px] font-medium uppercase tracking-[0.08em] text-slate-400">
        By <span className="font-bold">{author.name}</span>
        <span aria-hidden="true"> · </span>
        {author.position}
      </p>
      <p
        className={`mt-2 whitespace-pre-line text-[12px] leading-[1.55] ${
          featured ? "text-slate-200" : "text-slate-600"
        }`}
      >
        {section.body}
      </p>
      {section.links.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {section.links.map((link) => (
            <button
              key={`${section.id}-${link.href}`}
              type="button"
              onClick={() => router.push(link.href)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                featured
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950"
              }`}
            >
              {link.label}
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { WeeklyEditionSectionCardProps } from "@gshl-types";
import {
  buildWeeklyEditionCtaHref,
  getWeeklyEditionFallbackAuthor,
} from "@gshl-utils";

export function WeeklyEditionSectionCard({
  section,
  featured = false,
  teams = [],
}: WeeklyEditionSectionCardProps) {
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
          ? "flex h-full flex-col rounded-2xl border-2 border-slate-300 bg-white p-4 text-black sm:p-5"
          : "flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700 sm:text-xs">
          {section.eyebrow}
        </p>
        {teamMarks.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {conferenceMarks.map((team) => (
              <span
                key={`conference-${team.conferenceId}`}
                className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-200/70 p-0.5"
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
            ? "text-xl text-black sm:text-2xl"
            : "text-base text-slate-950"
        }`}
      >
        {section.headline}
      </h2>
      <p className="mt-1.5 text-[11px] font-medium uppercase leading-5 tracking-[0.06em] text-slate-600 sm:text-xs">
        By <span className="font-bold">{author.name}</span>
        <span aria-hidden="true"> · </span>
        {author.position}
      </p>
      <p
        className={`mt-2 whitespace-pre-line text-sm leading-6 ${
          featured ? "text-black" : "text-slate-600"
        }`}
      >
        {section.body}
      </p>
      {section.links.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {section.links.map((link) => (
            <Link
              key={`${section.id}-${link.href}`}
              href={buildWeeklyEditionCtaHref(link.href)}
              className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:transition-none ${
                featured
                  ? "border border-slate-300 bg-white text-black hover:bg-slate-50"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-950"
              }`}
            >
              {link.label}
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

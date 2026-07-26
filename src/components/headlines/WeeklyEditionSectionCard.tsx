"use client";

import { ArrowUpRight } from "lucide-react";
import { useAppRouter } from "@gshl-hooks";
import type { WeeklyEditionSectionCardProps } from "@gshl-types";

export function WeeklyEditionSectionCard({
  section,
  featured = false,
}: WeeklyEditionSectionCardProps) {
  const { router } = useAppRouter();

  return (
    <section
      id={section.id}
      className={
        featured
          ? "border-y-4 border-double border-slate-900 py-6"
          : "border-t border-slate-300 pt-5"
      }
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-700">
        {section.eyebrow}
      </p>
      <h2
        className={`mt-2 font-oswald font-semibold leading-tight text-slate-950 ${
          featured ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl"
        }`}
      >
        {section.headline}
      </h2>
      <p
        className={`mt-3 whitespace-pre-line leading-7 text-slate-700 ${
          featured ? "text-base sm:text-lg" : "text-sm sm:text-base"
        }`}
      >
        {section.body}
      </p>
      {section.links.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {section.links.map((link) => (
            <button
              key={`${section.id}-${link.href}`}
              type="button"
              onClick={() => router.push(link.href)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {link.label}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

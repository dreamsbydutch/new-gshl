"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useSeasonState } from "@gshl-hooks";
import { LeagueActivityCard } from "@gshl-components/home/LeagueActivityCard";
import { PowerRankingsHomeCard } from "@gshl-components/home/PowerRankingsHomeCard";
import { StandingsPreview } from "@gshl-components/home/StandingsPreview";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";

export function LeagueOverview() {
  const { selectedSeason, currentSeason, defaultSeason } = useSeasonState();
  const season = selectedSeason ?? currentSeason ?? defaultSeason;
  return (
    <main className="gshl-page" aria-labelledby="league-heading">
      <h1 id="league-heading" className="sr-only">
        League overview
      </h1>
      <section aria-labelledby="league-explore-heading">
        <SectionHeading
          id="league-explore-heading"
          title="Explore the league"
        />
        <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:gap-x-6">
          {[
            [
              "Schedule & results",
              "Weekly matchups, team schedules and NHL games",
              "/schedule?view=week",
            ],
            [
              "Standings & awards",
              "League table, playoff picture and season awards",
              "/standings?view=overall",
            ],
            [
              "Owner rankings",
              "Compare owners across league history",
              "/leagueoffice?view=ownerRankings",
            ],
            [
              "Conference contest",
              "Conference against conference",
              "/leagueoffice?view=confBattle",
            ],
          ].map(([title, description, href]) => (
            <Link
              key={href}
              href={href!}
              className="flex min-h-14 items-center justify-between gap-3 py-2 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-xs text-slate-500">
                  {description}
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <div className="grid items-start gap-x-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <LeagueActivityCard seasonId={season?.id} />
        {season ? (
          <div className="min-w-0">
            <StandingsPreview seasonId={season.id} />
            <PowerRankingsHomeCard seasonId={season.id} />
          </div>
        ) : null}
      </div>
    </main>
  );
}

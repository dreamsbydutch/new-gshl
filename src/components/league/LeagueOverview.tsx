"use client";

import { useSeasonState } from "@gshl-hooks";
import { LeagueActivityCard } from "@gshl-components/home/LeagueActivityCard";
import { PowerRankingsHomeCard } from "@gshl-components/home/PowerRankingsHomeCard";
import { HomeScoreboard } from "@gshl-components/home/HomeScoreboard";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";
import { LeaguePlayoffPreview } from "./LeaguePlayoffPreview";

export function LeagueOverview() {
  const { selectedSeason, currentSeason, defaultSeason } = useSeasonState();
  const season = selectedSeason ?? currentSeason ?? defaultSeason;
  return (
    <main className="gshl-page" aria-labelledby="league-heading">
      <h1 id="league-heading" className="sr-only">
        League overview
      </h1>
      <section aria-labelledby="league-matchups-heading">
        <SectionHeading
          id="league-matchups-heading"
          title="Weekly matchups"
          href={
            season
              ? `/schedule?view=week&season=${encodeURIComponent(season.id)}`
              : "/schedule?view=week"
          }
          action="Full schedule"
        />
        {season ? (
          <HomeScoreboard seasonId={season.id} />
        ) : (
          <p className="py-3 text-sm text-slate-500">
            Matchups will appear when a season is available.
          </p>
        )}
      </section>
      <div className="grid items-start gap-x-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {season ? (
          <div className="min-w-0">
            <LeaguePlayoffPreview season={season} />
            <PowerRankingsHomeCard seasonId={season.id} />
          </div>
        ) : null}
        <LeagueActivityCard seasonId={season?.id} />
      </div>
    </main>
  );
}

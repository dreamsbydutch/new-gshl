"use client";

import { useSeasonState } from "@gshl-hooks";
import { LeagueActivityCard } from "@gshl-components/home/LeagueActivityCard";
import { PowerRankingsHomeCard } from "@gshl-components/home/PowerRankingsHomeCard";
import { StandingsPreview } from "@gshl-components/home/StandingsPreview";

export function LeagueOverview() {
  const { selectedSeason, currentSeason, defaultSeason } = useSeasonState();
  const season = selectedSeason ?? currentSeason ?? defaultSeason;
  return (
    <main className="gshl-page" aria-labelledby="league-heading">
      <h1 id="league-heading" className="sr-only">
        League overview
      </h1>
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

"use client";
import { useSeasonState } from "@gshl-hooks";
import { HomeSkeleton } from "@gshl-skeletons";
import { resolveDraftHubSeason } from "@gshl-utils";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";
import { WeeklyEditionHomeCard } from "@gshl-components/headlines/WeeklyEditionHomeCard";
import { LeagueActivityCard } from "./LeagueActivityCard";
import { PowerRankingsHomeCard } from "./PowerRankingsHomeCard";
import { NHLScheduleHomeCard } from "./NHLScheduleHomeCard";
import { HomeScoreboard } from "./HomeScoreboard";
import { DraftHubCard } from "./DraftHubCard";
import { StandingsPreview } from "./StandingsPreview";
import { FreeAgencyNotice } from "./FreeAgencyNotice";
export function HomeContent() {
  const { seasons, currentSeason, defaultSeason, isLoading } = useSeasonState();
  if (isLoading) return <HomeSkeleton />;
  // Home follows the live league; historical selections belong in League.
  const season = currentSeason ?? defaultSeason;
  const draftSeason = resolveDraftHubSeason(seasons);
  return (
    <main aria-labelledby="home-dashboard-heading" className="gshl-page">
      <h1 id="home-dashboard-heading" className="sr-only">
        Around the GSHL
      </h1>
      {draftSeason?.draftStartAt ? <DraftHubCard season={draftSeason} /> : null}
      <FreeAgencyNotice />
      <section aria-labelledby="home-week-heading">
        <SectionHeading
          id="home-week-heading"
          title="This week"
          href={
            season
              ? `/schedule?view=week&season=${encodeURIComponent(String(season.id))}`
              : "/schedule?view=week"
          }
          action="Full schedule"
        />
        {season ? (
          <HomeScoreboard seasonId={String(season.id)} />
        ) : (
          <p className="py-3 text-sm text-slate-500">
            The league schedule will appear when a season is available.
          </p>
        )}
      </section>
      <section aria-labelledby="home-news-heading">
        <SectionHeading
          id="home-news-heading"
          title="League headlines"
          href="/headlines"
          action="All news"
        />
        <WeeklyEditionHomeCard />
      </section>
      <div className="gap-6 lg:columns-2">
        <LeagueActivityCard seasonId={season?.id} />
        {season ? <StandingsPreview seasonId={String(season.id)} /> : null}
        {season ? <PowerRankingsHomeCard seasonId={String(season.id)} /> : null}
        <NHLScheduleHomeCard />
      </div>
    </main>
  );
}

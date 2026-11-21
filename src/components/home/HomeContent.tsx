"use client";

import { ActivityTeamGroup } from "./ActivityTeamGroup";
import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { useHomeDashboard } from "@gshl-hooks/features/useHomeDashboard";
import { HomeSkeleton } from "@gshl-skeletons";
import { WeeklyEditionHomeCard } from "@gshl-components/headlines/WeeklyEditionHomeCard";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";
import { MasonryGrid } from "@gshl-components/ui/MasonryGrid";
import { NHLScheduleHomeCard } from "./NHLScheduleHomeCard";
import { NHLStandingsHomeCard } from "./NHLStandingsHomeCard";
import { DraftHubCard } from "./DraftHubCard";
import { HomeScoreboard } from "./HomeScoreboard";
import { StandingsPreview } from "./StandingsPreview";
import { PowerRankingsHomeCard } from "./PowerRankingsHomeCard";
import { FreeAgencyNotice } from "./FreeAgencyNotice";
import { LineupShameCard } from "./LineupShameCard";
import { OwnerBriefing } from "./OwnerBriefing";

export function HomeContent() {
  const view = useHomeDashboard();
  if (view.isLoading) return <HomeSkeleton />;
  const owner = view.owner.data;
  return (
    <main
      aria-labelledby="home-dashboard-heading"
      className="gshl-page space-y-2"
    >
      <div className="min-w-0">
        <h1 id="home-dashboard-heading" className="sr-only">
          GSHL home
        </h1>
        {view.season ? (
          <HomeScoreboard
            seasonId={view.season.id}
            ownerTeamId={owner?.team?.id}
          />
        ) : (
          <p className="py-4 text-sm text-slate-500">
            The league schedule will appear when a season is available.
          </p>
        )}
      </div>
      <MasonryGrid className="gshl-home-cards">
        <section aria-label="League headlines" className="gshl-section">
          <SectionHeading
            id="home-news-heading"
            title="League news"
            href="/headlines"
            action="All news"
          />
          <div className="mx-auto w-full max-w-sm">
            <WeeklyEditionHomeCard />
          </div>
        </section>
        {view.season ? <StandingsPreview seasonId={view.season.id} /> : null}
        {view.attention.length ? (
          <section
            aria-label="Needs attention"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3"
          >
            <ul className="divide-y divide-amber-200/60">
              {view.attention.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 items-center gap-2 text-xs font-semibold text-amber-950"
                  >
                    <Bell className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <OwnerBriefing view={view} />
        {!view.matchup && view.draftSeason?.draftStartAt ? (
          <DraftHubCard season={view.draftSeason} />
        ) : null}
        <FreeAgencyNotice />

        <section
          aria-labelledby="rundown-updates-heading"
          className="gshl-section"
        >
          <SectionHeading
            id="rundown-updates-heading"
            title="Today's league activity"
            href="/activity"
            action="View all"
          />
          {view.activityLoading ? (
            <p role="status" className="py-5 text-sm text-slate-500">
              Loading updates…
            </p>
          ) : view.activity.length ? (
            <ul className="mx-auto w-full max-w-sm divide-y divide-slate-100">
              {view.activity.map((group) => (
                <li key={group.id}>
                  <ActivityTeamGroup
                    group={group}
                    href={view.teamHref(group.teamId)}
                    ownId={owner?.team?.id}
                    opponentId={view.matchup?.opponent?.id}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-sm text-slate-500">
              No league activity today.
            </p>
          )}
        </section>
        {view.season ? (
          <PowerRankingsHomeCard seasonId={view.season.id} />
        ) : null}
        <NHLScheduleHomeCard />
        {view.season ? (
          <NHLStandingsHomeCard
            seasonId={view.season.id}
            seasonYear={view.season.year}
          />
        ) : null}
        {view.season ? <LineupShameCard seasonId={view.season.id} /> : null}
      </MasonryGrid>
    </main>
  );
}

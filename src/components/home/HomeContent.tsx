"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, Plus, Minus, ArrowLeftRight } from "lucide-react";
import { useHomeDashboard } from "@gshl-hooks/features/useHomeDashboard";
import { HomeSkeleton } from "@gshl-skeletons";
import { showDate } from "@gshl-utils";
import { WeeklyEditionHomeCard } from "@gshl-components/headlines/WeeklyEditionHomeCard";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";
import { MasonryGrid } from "@gshl-components/ui/MasonryGrid";
import { NHLScheduleHomeCard } from "./NHLScheduleHomeCard";
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
          <HomeScoreboard seasonId={view.season.id} />
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
            title={owner ? "Updates for you" : "League activity"}
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
                  <Link
                    href={view.teamHref(group.teamId)}
                    className="flex min-h-11 items-start gap-2 py-2 focus-visible:ring-2 focus-visible:ring-slate-500"
                    title={group.teamName || "League transaction"}
                  >
                    {group.teamLogoUrl ? (
                      <Image
                        src={group.teamLogoUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="mt-1 h-8 w-8 shrink-0 object-contain"
                      />
                    ) : (
                      <span
                        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600"
                        aria-hidden="true"
                      >
                        {group.teamAbbr}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 pb-1">
                        <span
                          className="min-w-0 truncate text-xs font-semibold text-slate-600"
                          title={group.teamName}
                        >
                          <span className="sr-only">
                            {group.teamId === owner?.team?.id
                              ? "Your team ? "
                              : group.teamId === view.matchup?.opponent?.id
                                ? "Your opponent ? "
                                : ""}
                          </span>
                          {group.teamName || "Trade"}
                        </span>
                        <time
                          dateTime={group.date}
                          className="shrink-0 text-[10px] text-slate-500"
                        >
                          {showDate(group.date)}
                        </time>
                      </div>
                      <ul className="space-y-1">
                        {group.events.map((event) => (
                          <li
                            key={event.id}
                            className="flex items-start gap-1.5"
                          >
                            <span
                              title={
                                event.type === "add"
                                  ? "Added"
                                  : event.type === "drop"
                                    ? "Dropped"
                                    : event.type
                              }
                              className={
                                event.type === "add"
                                  ? "mt-0.5 text-emerald-600"
                                  : event.type === "drop"
                                    ? "mt-0.5 text-rose-600"
                                    : "mt-0.5 text-slate-500"
                              }
                            >
                              {event.type === "add" ? (
                                <Plus className="h-4 w-4" aria-hidden="true" />
                              ) : event.type === "drop" ? (
                                <Minus className="h-4 w-4" aria-hidden="true" />
                              ) : (
                                <ArrowLeftRight
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <span className="min-w-0 break-words text-sm font-semibold">
                              <span className="sr-only">
                                {event.type === "add"
                                  ? "Added: "
                                  : event.type === "drop"
                                    ? "Dropped: "
                                    : event.type + ": "}
                              </span>
                              {event.playerName || event.teamName}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-sm text-slate-500">
              No recent league activity.
            </p>
          )}
        </section>
        {view.season ? (
          <PowerRankingsHomeCard seasonId={view.season.id} />
        ) : null}
        <NHLScheduleHomeCard />
        {view.season ? <LineupShameCard seasonId={view.season.id} /> : null}
      </MasonryGrid>
    </main>
  );
}

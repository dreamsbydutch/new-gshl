"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Bell,
  ChevronRight,
  Plus,
  Minus,
  ArrowLeftRight,
} from "lucide-react";
import { useHomeDashboard } from "@gshl-hooks/features/useHomeDashboard";
import { HomeSkeleton } from "@gshl-skeletons";
import { showDate } from "@gshl-utils";
import { WeeklyEditionHomeCard } from "@gshl-components/headlines/WeeklyEditionHomeCard";
import { SectionHeading } from "@gshl-components/ui/SectionHeading";
import { PowerRankingsHomeCard } from "./PowerRankingsHomeCard";
import { NHLScheduleHomeCard } from "./NHLScheduleHomeCard";
import { DraftHubCard } from "./DraftHubCard";
import { HomeScoreboard } from "./HomeScoreboard";
import { StandingsPreview } from "./StandingsPreview";
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
      className="gshl-page space-y-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {view.season?.name ?? "Gem Stone Hockey League"}
          </p>
          <h1
            id="home-dashboard-heading"
            className="text-xl font-bold tracking-tight text-slate-950"
          >
            {owner ? "Your daily rundown" : "Around the GSHL"}
          </h1>
        </div>
        <Link
          href={owner?.actions.viewRoster ?? "/teams"}
          className="gshl-text-action"
        >
          {owner ? "My team" : "All teams"}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </header>
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
      {view.season ? (
        <section>
          <SectionHeading
            id="home-matchups-heading"
            title={owner ? "Around your league" : "This week's matchups"}
            href="/schedule?view=week"
            action="All matchups"
          />
          <HomeScoreboard seasonId={view.season.id} />
        </section>
      ) : (
        <p className="py-4 text-sm text-slate-500">
          The league schedule will appear when a season is available.
        </p>
      )}
      <div className="grid min-w-0 items-start gap-3 md:grid-cols-2 md:gap-x-5">
        <section aria-labelledby="rundown-updates-heading" className="min-w-0">
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
            <ul className="divide-y divide-slate-100">
              {view.activity.map((event) => (
                <li key={event.id}>
                  <Link
                    href={view.teamHref(event.teamId)}
                    className="flex min-h-11 items-center gap-2 py-1.5 focus-visible:ring-2 focus-visible:ring-slate-500"
                    title={`${event.teamName}: ${event.type} ${event.playerName ?? ""}`}
                  >
                    {event.teamLogoUrl ? (
                      <Image
                        src={event.teamLogoUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 object-contain"
                      />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded-full bg-slate-100" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">
                        {event.teamId === owner?.team?.id
                          ? "Your team · "
                          : event.teamId === view.matchup?.opponent?.id
                            ? "Your opponent · "
                            : ""}
                        {event.type === "add"
                          ? "Roster addition"
                          : event.type === "drop"
                            ? "Roster drop"
                            : event.type}
                      </span>
                      <span className="block truncate text-sm font-semibold">
                        {event.playerName || event.teamName}
                      </span>
                      <span className="sr-only">{event.teamName}</span>
                    </span>
                    <span
                      title={event.type}
                      className={
                        event.type === "add"
                          ? "text-emerald-600"
                          : event.type === "drop"
                            ? "text-rose-600"
                            : "text-slate-500"
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
                    <time
                      dateTime={event.date}
                      className="shrink-0 text-[10px] text-slate-500"
                    >
                      {showDate(event.date)}
                    </time>
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
        <div className="min-w-0 space-y-3">
          {view.season ? <StandingsPreview seasonId={view.season.id} /> : null}
          <section aria-label="League headlines">
            <SectionHeading
              id="home-news-heading"
              title="League news"
              href="/headlines"
              action="All news"
            />
            <WeeklyEditionHomeCard />
          </section>
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-3 md:grid-cols-2 md:gap-x-5">
        {view.season ? (
          <PowerRankingsHomeCard seasonId={view.season.id} />
        ) : null}
        <NHLScheduleHomeCard />
      </div>
      {view.season ? <LineupShameCard seasonId={view.season.id} /> : null}
    </main>
  );
}

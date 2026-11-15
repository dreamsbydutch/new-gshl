"use client";

import Image from "next/image";
import Link from "next/link";
import type { useHomeDashboard } from "@gshl-hooks/features/useHomeDashboard";
import { useTeamPalette } from "@gshl-hooks";
import { showDate } from "@gshl-utils";

function TeamMark({ name, logo }: { name: string; logo?: string | null }) {
  return logo ? (
    <Image
      src={logo}
      alt=""
      width={60}
      height={60}
      className="h-10 w-10 object-contain sm:h-12 sm:w-12"
    />
  ) : (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xl font-bold">
      {name.slice(0, 1)}
    </span>
  );
}
function updatedLabel(timestamp?: number | null) {
  return timestamp
    ? new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Toronto",
      }).format(timestamp) + " ET"
    : "Awaiting update";
}

export function OwnerBriefing({
  view,
}: {
  view: ReturnType<typeof useHomeDashboard>;
}) {
  const owner = view.owner.data;
  const palette = useTeamPalette(owner?.team?.logoUrl);
  if (!owner) return null;
  const matchup = view.matchup;
  if (!matchup)
    return (
      <section className="rounded-lg bg-slate-950 p-3 text-white">
        <p className="text-xs uppercase tracking-wider text-slate-400">
          Between matchups
        </p>
        <h2 className="mt-1 text-xl font-bold">{owner.team?.name}</h2>

        <div className="mt-1 flex flex-wrap gap-2">
          <Link
            href={owner.actions.viewDraftPicks}
            className="inline-flex min-h-11 items-center text-sm font-semibold"
          >
            Your draft picks →
          </Link>
          <Link
            href={owner.actions.viewContracts}
            className="inline-flex min-h-11 items-center text-sm font-semibold"
          >
            Contracts & cap →
          </Link>
        </div>
      </section>
    );
  const current = Boolean(owner.matchup.current);
  const ownIsHome = matchup.homeTeamId === owner.team?.id;
  const ownScore = ownIsHome ? matchup.homeScore : matchup.awayScore;
  const opponentScore = ownIsHome ? matchup.awayScore : matchup.homeScore;
  return (
    <section
      aria-label="Your matchup"
      className="overflow-hidden rounded-lg border-t-2 bg-slate-950 text-white"
      style={{ borderTopColor: palette.primary ?? "#64748b" }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-xs">
        <span className="font-semibold uppercase tracking-wider">
          {current ? "This week" : "Up next"} · Week {matchup.weekNum ?? "TBD"}
        </span>
        <Link
          href={`/standings?view=overall&season=${view.season?.id}`}
          className="rounded py-1 text-slate-300 focus-visible:ring-2 focus-visible:ring-white"
        >
          {view.standing
            ? `#${view.standing.rank} in league${view.standing.points == null ? "" : ` · ${view.standing.points} pts`}`
            : "View standings"}{" "}
          →
        </Link>
      </div>
      <Link
        href={matchup.href}
        className="block px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white sm:px-3"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
            <TeamMark
              name={owner.team?.name ?? "Your team"}
              logo={owner.team?.logoUrl}
            />
            <span className="line-clamp-2 text-xs font-semibold sm:text-sm">
              {owner.team?.name}
            </span>
          </div>
          <div className="text-center">
            <p className="whitespace-nowrap font-mono text-3xl font-bold tracking-tight sm:text-4xl">
              {current ? `${ownScore ?? "–"} : ${opponentScore ?? "–"}` : "VS"}
            </p>
            <span className="mt-1 block text-[10px] uppercase tracking-wider text-slate-400">
              {current ? "Category score" : "Upcoming matchup"}
            </span>
          </div>
          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
            <TeamMark
              name={matchup.opponent?.name ?? "Opponent"}
              logo={matchup.opponent?.logoUrl}
            />
            <span className="line-clamp-2 text-xs font-semibold sm:text-sm">
              {matchup.opponent?.name ?? "Opponent TBD"}
            </span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            {matchup.weekStartDate
              ? showDate(matchup.weekStartDate)
              : "Dates pending"}{" "}
            – {matchup.weekEndDate ? showDate(matchup.weekEndDate) : ""}
          </span>
          <span className="font-semibold text-white">Open matchup →</span>
        </div>
        {current && view.progress != null ? (
          <div
            role="progressbar"
            aria-label="Matchup week elapsed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(view.progress)}
            className="mt-2 h-1 overflow-hidden rounded-full bg-white/15"
          >
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${view.progress}%` }}
            />
          </div>
        ) : null}
      </Link>
      {current ? (
        <div
          className="grid grid-cols-2 gap-2 border-t border-white/10 px-3 py-1.5 text-[10px] text-slate-400"
          aria-label="Latest recorded change to each team's weekly totals"
        >
          <span>
            Your totals:{" "}
            {updatedLabel(
              ownIsHome ? view.timestamps?.home : view.timestamps?.away,
            )}
          </span>
          <span className="text-right">
            Opponent:{" "}
            {updatedLabel(
              ownIsHome ? view.timestamps?.away : view.timestamps?.home,
            )}
          </span>
        </div>
      ) : null}
    </section>
  );
}

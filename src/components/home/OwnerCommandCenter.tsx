"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightLeft,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  ListPlus,
  Users,
} from "lucide-react";

import { useOwnerCommandCenter } from "@gshl-hooks/features/useOwnerCommandCenter";
import { PlayerInjuryBadge } from "@gshl-components/player/PlayerInjuryBadge";
import { Button, Skeleton } from "@gshl-ui";
import { cn, formatMoney } from "@gshl-utils";

function shortDate(value: string | null | undefined) {
  if (!value) return "Date TBD";
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value,
  );
  if (Number.isNaN(date.getTime())) return "Date TBD";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  }).format(date);
}

function TeamMark({
  team,
  size = 44,
}: {
  team: NonNullable<ReturnType<typeof useOwnerCommandCenter>["data"]>["team"];
  size?: number;
}) {
  if (team?.logoUrl) {
    return (
      <Image
        src={team.logoUrl}
        alt={`${team.name ?? "Team"} logo`}
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-label={team?.name ?? "Team"}
      className="flex shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500"
      role="img"
      style={{ width: size, height: size }}
    >
      {team?.abbr ?? "GSHL"}
    </span>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Users;
  title: string;
  detail?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      </div>
      {detail ? (
        <p className="shrink-0 font-mono text-xs text-slate-500">{detail}</p>
      ) : null}
    </header>
  );
}

function RosterPanel({
  view,
}: {
  view: NonNullable<ReturnType<typeof useOwnerCommandCenter>["data"]>;
}) {
  const { roster } = view;
  const rosterNeeds = roster.gaps
    .map((gap) => `${gap.label} x${gap.missing}`)
    .join(", ");
  return (
    <section
      aria-labelledby="owner-roster-summary-heading"
      className="border-b border-slate-200 py-2"
    >
      <div id="owner-roster-summary-heading">
        <SectionHeading
          icon={Users}
          title="Roster"
          detail={`${roster.count}/${roster.capacity}`}
        />
      </div>
      {roster.players.length ? (
        <ul
          aria-label="Compact current roster"
          className="mt-1 grid grid-cols-2 gap-x-2 border-y border-slate-100 py-1 sm:grid-cols-3"
        >
          {roster.players.slice(0, 8).map((player) => (
            <li
              key={player.id}
              className="flex min-w-0 items-baseline gap-1 py-1 text-xs leading-4"
            >
              <span
                className="truncate font-medium text-slate-900"
                title={player.fullName}
              >
                {player.fullName}
              </span>
              <PlayerInjuryBadge
                name={player.fullName}
                teams={player.nhlTeam}
              />
              <span className="shrink-0 font-mono text-[11px] text-slate-400">
                {player.lineupPos ??
                  (player.nhlPos.length
                    ? player.nhlPos.join("/")
                    : player.posGroup)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 border-y border-slate-100 py-2 text-xs text-slate-500">
          No active players are assigned.
        </p>
      )}
      <p className="mt-1 text-[11px] leading-tight text-slate-500">
        {roster.gaps.length ? (
          <span className="text-amber-800">Needs {rosterNeeds}</span>
        ) : (
          <span className="text-emerald-700">Lineup slots covered</span>
        )}
        {roster.openSpots > 0
          ? ` · ${roster.openSpots} open`
          : " · Roster full"}
        {roster.unassigned > 0 ? ` · ${roster.unassigned} unassigned` : ""}
      </p>
      <Link
        href={view.actions.viewRoster}
        className="mt-1 inline-flex min-h-7 items-center gap-1 text-xs font-medium text-slate-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        View full roster
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}

function CapPanel({
  view,
}: {
  view: NonNullable<ReturnType<typeof useOwnerCommandCenter>["data"]>;
}) {
  return (
    <section
      aria-labelledby="owner-cap-summary-heading"
      className="border-b border-slate-200 py-2"
    >
      <div id="owner-cap-summary-heading">
        <SectionHeading
          icon={CircleDollarSign}
          title="Cap & contracts"
          detail={`${view.contractDecisions.length} decision${view.contractDecisions.length === 1 ? "" : "s"}`}
        />
      </div>
      {view.cap.length ? (
        <dl className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
          {view.cap.map((season) => (
            <div
              key={season.year}
              className="flex items-center justify-between gap-3 py-1.5 text-xs"
            >
              <dt className="text-slate-500">{season.label}</dt>
              <dd
                className={cn(
                  "font-mono font-semibold",
                  season.remaining < 0 ? "text-rose-700" : "text-slate-950",
                )}
              >
                {formatMoney(season.remaining)}
                <span className="ml-1 font-sans text-[11px] font-normal text-slate-400">
                  ({season.playerCount})
                </span>
                {season.reserved > 0 ? (
                  <span className="ml-1 font-sans font-normal text-slate-400">
                    after offers
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No cap window available.</p>
      )}
      <div className="mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Upcoming decisions
        </p>
        {view.contractDecisions.length ? (
          <ul className="mt-1 divide-y divide-slate-100">
            {view.contractDecisions.slice(0, 4).map((decision) => (
              <li
                key={decision.id}
                className="flex items-center justify-between gap-3 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {decision.playerName}
                  </p>
                  <p className="text-slate-400">
                    {decision.expiryStatus} · {formatMoney(decision.capHit)}
                  </p>
                </div>
                <span className="shrink-0 text-slate-500">
                  {shortDate(decision.expiryDate)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-slate-500">
            No contracts expire in the next two seasons.
          </p>
        )}
      </div>
    </section>
  );
}

function MatchupPanel({
  view,
}: {
  view: NonNullable<ReturnType<typeof useOwnerCommandCenter>["data"]>;
}) {
  const record = view.matchup.record;
  const rows: Array<{
    label: string;
    matchup: (typeof view.matchup.upcoming)[number];
    result: "W" | "L" | "T" | null;
    score: string | null;
  }> = [];

  if (view.matchup.current)
    rows.push({
      label: "Current",
      matchup: view.matchup.current,
      result: null,
      score: view.matchup.current.score,
    });
  view.matchup.upcoming
    .slice(0, 1)
    .forEach((matchup) =>
      rows.push({ label: "Next", matchup, result: null, score: null }),
    );
  if (view.matchup.latest)
    rows.push({
      label: "Last",
      matchup: view.matchup.latest,
      result: view.matchup.latest.result,
      score: view.matchup.latest.score,
    });

  return (
    <section
      aria-labelledby="owner-matchup-summary-heading"
      className="border-b border-slate-200 py-2 md:col-span-2"
    >
      <div id="owner-matchup-summary-heading">
        <SectionHeading
          icon={CalendarDays}
          title="Matchups"
          detail={`Recent: ${record.wins}-${record.losses}-${record.ties}`}
        />
      </div>
      {rows.length ? (
        <ul className="mt-1 divide-y divide-slate-100 border-y border-slate-100">
          {rows.map(({ label, matchup, result, score }) => (
            <li key={matchup.id}>
              <Link
                href={matchup.href}
                aria-label={`${label} matchup against ${matchup.opponent?.name ?? "opponent"}`}
                className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <TeamMark team={matchup.opponent} size={26} />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {label} ·{" "}
                    {matchup.weekNum ? `Week ${matchup.weekNum}` : "Week TBD"} ·{" "}
                    {matchup.homeTeamId === view.team?.id ? "Home" : "Away"}
                  </span>
                  <span className="block truncate text-xs font-semibold text-slate-950">
                    {matchup.opponent?.name ?? "Opponent TBD"}
                  </span>
                </span>
                <span className="text-right">
                  <span
                    className={cn(
                      "block font-mono text-[11px] font-semibold",
                      result === "W"
                        ? "text-emerald-700"
                        : result === "L"
                          ? "text-rose-700"
                          : "text-slate-700",
                    )}
                  >
                    {result
                      ? `${result}${score ? ` ${score}` : ""}`
                      : (score ?? shortDate(matchup.weekStartDate))}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {result
                      ? shortDate(matchup.weekStartDate)
                      : `to ${shortDate(matchup.weekEndDate)}`}
                  </span>
                </span>
                <ChevronRight
                  className="h-3.5 w-3.5 text-slate-400"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 border-y border-slate-100 py-2 text-xs text-slate-500">
          No matchup is scheduled yet.
        </p>
      )}
    </section>
  );
}

function DraftLink({
  view,
}: {
  view: NonNullable<ReturnType<typeof useOwnerCommandCenter>["data"]>;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="min-h-11 w-full justify-between px-2 sm:col-span-2"
    >
      <Link href={view.actions.viewDraftPicks}>
        <span className="flex items-center gap-2">
          <ClipboardList
            className="h-4 w-4 text-slate-500"
            aria-hidden="true"
          />
          <span>Draft picks</span>
        </span>
        <span className="flex items-center gap-1 font-mono text-xs font-normal text-slate-500">
          {view.draft.count} pick{view.draft.count === 1 ? "" : "s"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </Link>
    </Button>
  );
}

function InboxPanel({
  view,
  lastViewedAt,
  unreadCount,
  onMarkRead,
}: {
  view: NonNullable<ReturnType<typeof useOwnerCommandCenter>["data"]>;
  lastViewedAt: string | null;
  unreadCount: number;
  onMarkRead: () => void;
}) {
  return (
    <section
      aria-labelledby="owner-inbox-summary-heading"
      className="border-b border-slate-200 py-2 md:col-span-2"
    >
      <div id="owner-inbox-summary-heading">
        <SectionHeading
          icon={Bell}
          title="Offers & activity"
          detail={unreadCount ? `${unreadCount} new` : "Caught up"}
        />
      </div>
      <dl className="mt-2 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-100 py-1.5 text-center">
        <div>
          <dt className="text-[11px] text-slate-400">UFA offers</dt>
          <dd className="font-mono text-sm font-semibold text-slate-950">
            {view.offers.length}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400">Your listings</dt>
          <dd className="font-mono text-sm font-semibold text-slate-950">
            {view.listedPlayers.length}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-400">Recent listings</dt>
          <dd className="font-mono text-sm font-semibold text-slate-950">
            {view.activity.filter((item) => item.kind === "trade").length}
          </dd>
        </div>
      </dl>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Pending decisions
          </p>
          {view.offers.length || view.listedPlayers.length ? (
            <ul className="mt-1 divide-y divide-slate-100">
              {view.offers.slice(0, 3).map((offer) => (
                <li key={offer.id} className="py-1.5 text-xs">
                  <Link
                    href={view.actions.reviewOffer}
                    className="flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">
                        {offer.playerName}
                      </span>
                      <span className="text-slate-400">
                        {offer.contractLength} year
                        {offer.contractLength === 1 ? "" : "s"} ·{" "}
                        {formatMoney(offer.salary)}
                      </span>
                    </span>
                    <span className="shrink-0 text-slate-500">
                      {shortDate(offer.deadlineAt)}
                    </span>
                  </Link>
                </li>
              ))}
              {view.listedPlayers.slice(0, 3).map((listing) => (
                <li key={listing.listingId} className="py-1.5 text-xs">
                  <Link
                    href={view.actions.listPlayer}
                    className="flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="truncate font-medium text-slate-900">
                      {listing.playerName}
                    </span>
                    <span className="shrink-0 text-slate-400">Listed</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              No pending UFA offers or active player listings.
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Recent activity
            </p>
            {unreadCount ? (
              <button
                type="button"
                onClick={onMarkRead}
                className="text-xs font-medium text-slate-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Mark read
              </button>
            ) : null}
          </div>
          {view.activity.length ? (
            <ul className="mt-1 divide-y divide-slate-100">
              {view.activity.slice(0, 5).map((item) => {
                const unread = Boolean(
                  lastViewedAt && item.occurredAt > lastViewedAt,
                );
                return (
                  <li key={item.id} className="py-1.5 text-xs">
                    <Link
                      href={item.href}
                      className="flex min-w-0 items-start gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          unread ? "bg-sky-600" : "bg-slate-200",
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">
                          {item.title}
                        </span>
                        <span className="text-slate-400">
                          {item.detail} · {shortDate(item.occurredAt)}
                        </span>
                      </span>
                      {unread ? <span className="sr-only">Unread</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              No new trade-market or UFA activity.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function OwnerCommandCenter() {
  const commandCenter = useOwnerCommandCenter();
  if (commandCenter.isLoading) return <OwnerCommandCenterSkeleton />;
  if (!commandCenter.isEligible)
    return (
      <p className="py-3 text-sm text-slate-500">
        Your account is not linked to an active team. Select a team to explore
        its roster and history.
      </p>
    );
  if (!commandCenter.data)
    return (
      <p className="py-3 text-sm text-slate-500">
        Your team summary is unavailable right now.
      </p>
    );
  const view = commandCenter.data;
  const cap = view.cap[0];
  const decisions = view.contractDecisions.length;
  const needsAttention =
    decisions > 0 ||
    view.offers.length > 0 ||
    Boolean(cap && cap.remaining < 0) ||
    view.roster.gaps.length > 0;
  return (
    <section aria-labelledby="owner-command-center-heading">
      <header className="flex min-h-14 items-center gap-2 border-b border-slate-200 py-2">
        <TeamMark team={view.team} size={36} />
        <div className="min-w-0">
          <h2
            id="owner-command-center-heading"
            className="truncate text-base font-bold"
          >
            {view.team?.name ?? view.ownerName}
          </h2>
          <p className="text-xs text-slate-500">
            {view.season?.name ?? "Current season"}
          </p>
        </div>
      </header>
      <MatchupPanel view={view} />
      <section
        aria-labelledby="owner-attention-heading"
        className="border-b border-slate-200 py-2"
      >
        <h3 id="owner-attention-heading" className="gshl-section-title">
          Needs attention
        </h3>
        {needsAttention ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {view.offers.length ? (
              <li>
                <Link
                  href={view.actions.reviewOffer}
                  className="flex min-h-11 items-center justify-between gap-2 font-semibold"
                >
                  <span>
                    {view.offers.length} pending free-agent offer
                    {view.offers.length === 1 ? "" : "s"}
                  </span>
                  <span className="gshl-text-action">
                    Review offers{" "}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ) : null}
            {decisions ? (
              <li>
                <Link
                  href={`/lockerroom?view=salary&owner=${encodeURIComponent(view.ownerId)}`}
                  className="flex min-h-11 items-center justify-between gap-2"
                >
                  <span>
                    {decisions} upcoming contract decision
                    {decisions === 1 ? "" : "s"}
                  </span>
                  <span className="gshl-text-action">
                    Review contracts{" "}
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ) : null}
            {cap && cap.remaining < 0 ? (
              <li>
                <Link
                  href={`/lockerroom?view=salary&owner=${encodeURIComponent(view.ownerId)}`}
                  className="flex min-h-11 items-center justify-between gap-2"
                >
                  <span className="font-semibold text-rose-700">
                    {formatMoney(Math.abs(cap.remaining))} over the cap
                  </span>
                  <span className="gshl-text-action">Manage cap</span>
                </Link>
              </li>
            ) : null}
            {view.roster.gaps.length ? (
              <li>
                <Link
                  href={view.actions.viewRoster}
                  className="flex min-h-11 items-center justify-between gap-2"
                >
                  <span>
                    Lineup gaps:{" "}
                    {view.roster.gaps
                      .map((gap) => `${gap.label} x${gap.missing}`)
                      .join(", ")}
                  </span>
                  <span className="gshl-text-action">View roster</span>
                </Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="py-2 text-xs text-slate-500">
            You&apos;re caught up. No pending offers, upcoming contract
            decisions or lineup gaps.
          </p>
        )}
      </section>
      <div className="grid gap-x-6 md:grid-cols-2">
        <RosterPanel view={view} />
        <CapPanel view={view} />
        <InboxPanel
          view={view}
          lastViewedAt={commandCenter.lastViewedAt}
          unreadCount={commandCenter.unreadCount}
          onMarkRead={commandCenter.markActivityRead}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 border-b border-slate-200">
        <Link className="gshl-text-action" href={view.actions.exploreTrade}>
          <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
          Trade market
        </Link>
        <Link className="gshl-text-action" href={view.actions.listPlayer}>
          <ListPlus className="h-4 w-4" aria-hidden="true" />
          List a player
        </Link>
      </div>
      <DraftLink view={view} />
    </section>
  );
}

function OwnerCommandCenterSkeleton() {
  return (
    <section
      aria-label="Loading My Team command center"
      aria-busy="true"
      className="mx-auto w-full max-w-5xl border-y border-slate-300 py-1.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-2.5 w-28" />
            <Skeleton className="h-4 w-44 max-w-[80%]" />
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-1 sm:w-auto">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-9 rounded-md sm:w-24" />
          ))}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-6 border-y border-slate-100 py-1 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "space-y-1 px-2",
              index < 3 ? "col-span-2" : "col-span-3",
              index === 1 || index === 2 || index === 4
                ? "border-l border-slate-200"
                : "",
              index === 3 ? "pl-0 sm:border-l sm:border-slate-200 sm:pl-2" : "",
              "sm:col-span-1",
            )}
          >
            <Skeleton className="h-2 w-10" />
            <Skeleton className="h-4 w-16 max-w-full" />
            <Skeleton className="h-2 w-20 max-w-full" />
          </div>
        ))}
      </div>
      <div className="flex min-h-9 items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-4" />
      </div>
    </section>
  );
}

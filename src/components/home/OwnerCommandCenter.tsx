"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightLeft,
  Bell,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  ListPlus,
  Shield,
  Users,
} from "lucide-react";

import { useOwnerCommandCenter } from "@gshl-hooks/features/useOwnerCommandCenter";
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

function CommandAction({
  href,
  icon: Icon,
  label,
  count,
  primary = false,
}: {
  href: string;
  icon: typeof ArrowRightLeft;
  label: string;
  count?: number;
  primary?: boolean;
}) {
  return (
    <Button
      asChild
      variant={primary ? "default" : "outline"}
      className="min-w-0 justify-between px-3"
    >
      <Link href={href}>
        <span className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        {count ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
              primary
                ? "bg-white/15 text-white"
                : "bg-slate-100 text-slate-600",
            )}
          >
            {count}
          </span>
        ) : null}
      </Link>
    </Button>
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
  return (
    <section
      aria-labelledby="owner-roster-summary-heading"
      className="rounded-lg border border-slate-200 p-3 sm:p-4"
    >
      <div id="owner-roster-summary-heading">
        <SectionHeading
          icon={Users}
          title="Roster"
          detail={`${roster.count}/${roster.capacity}`}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {roster.composition.map((entry) => (
          <div key={entry.position} className="border-l border-slate-200 pl-2">
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">
              {entry.position}
            </dt>
            <dd className="font-mono text-sm font-semibold text-slate-900">
              {entry.count}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {roster.gaps.length ? (
          roster.gaps.map((gap) => (
            <span
              key={gap.position}
              className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-900"
            >
              Need {gap.label} ×{gap.missing}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
            Lineup slots covered
          </span>
        )}
        {roster.openSpots > 0 ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            {roster.openSpots} open roster spot
            {roster.openSpots === 1 ? "" : "s"}
          </span>
        ) : null}
        {roster.unassigned > 0 ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            {roster.unassigned} unassigned
          </span>
        ) : null}
      </div>
      <details className="mt-3 border-t border-slate-100 pt-2">
        <summary className="flex min-h-9 cursor-pointer items-center text-xs font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          View current roster
        </summary>
        <ul className="grid gap-x-4 divide-y divide-slate-100 sm:grid-cols-2 sm:[&>li:nth-child(2)]:border-t-0">
          {roster.players.map((player) => (
            <li
              key={player.id}
              className="flex min-w-0 items-center justify-between gap-3 py-2 text-xs"
            >
              <span className="truncate font-medium text-slate-900">
                {player.fullName}
              </span>
              <span className="shrink-0 text-slate-500">
                {player.lineupPos ??
                  (player.nhlPos.length
                    ? player.nhlPos.join("/")
                    : player.posGroup)}
              </span>
            </li>
          ))}
        </ul>
      </details>
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
      className="rounded-lg border border-slate-200 p-3 sm:p-4"
    >
      <div id="owner-cap-summary-heading">
        <SectionHeading
          icon={CircleDollarSign}
          title="Cap & contracts"
          detail={`${view.contractDecisions.length} decisions`}
        />
      </div>
      {view.cap.length ? (
        <dl className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
          {view.cap.map((season) => (
            <div
              key={season.year}
              className="flex items-center justify-between gap-3 py-2 text-xs"
            >
              <dt className="text-slate-500">{season.label}</dt>
              <dd
                className={cn(
                  "font-mono font-semibold",
                  season.remaining < 0 ? "text-rose-700" : "text-slate-950",
                )}
              >
                {formatMoney(season.remaining)}
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
        <p className="mt-3 text-xs text-slate-500">No cap window available.</p>
      )}
      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Upcoming decisions
        </p>
        {view.contractDecisions.length ? (
          <ul className="mt-1 divide-y divide-slate-100">
            {view.contractDecisions.slice(0, 4).map((decision) => (
              <li
                key={decision.id}
                className="flex items-center justify-between gap-3 py-2 text-xs"
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
          <p className="mt-2 text-xs text-slate-500">
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
  const next = view.matchup.next;
  const record = view.matchup.record;
  return (
    <section
      aria-labelledby="owner-matchup-summary-heading"
      className="rounded-lg border border-slate-200 p-3 sm:p-4"
    >
      <div id="owner-matchup-summary-heading">
        <SectionHeading
          icon={CalendarDays}
          title="Matchup"
          detail={`${record.wins}-${record.losses}-${record.ties}`}
        />
      </div>
      {next ? (
        <div className="mt-3 flex items-center gap-3 border-y border-slate-100 py-3">
          <TeamMark team={next.opponent} size={42} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {next.weekNum ? `Week ${next.weekNum}` : "Next matchup"} ·{" "}
              {next.homeTeamId === view.team?.id ? "Home" : "Away"}
            </p>
            <p className="truncate text-sm font-semibold text-slate-950">
              {next.opponent?.name ?? "Opponent TBD"}
            </p>
            <p className="text-xs text-slate-500">
              {shortDate(next.weekStartDate)}–{shortDate(next.weekEndDate)}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-y border-slate-100 py-4 text-xs text-slate-500">
          No upcoming matchup is scheduled.
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 gap-1.5" aria-label="Recent team results">
          {view.matchup.recent.length ? (
            view.matchup.recent.map((matchup) => (
              <span
                key={matchup.id}
                title={`${matchup.opponent?.name ?? "Opponent"}${matchup.score ? ` ${matchup.score}` : ""}`}
                className={cn(
                  "flex h-7 min-w-7 items-center justify-center rounded-md px-1 font-mono text-xs font-semibold",
                  matchup.result === "W"
                    ? "bg-emerald-50 text-emerald-800"
                    : matchup.result === "L"
                      ? "bg-rose-50 text-rose-800"
                      : "bg-slate-100 text-slate-700",
                )}
              >
                {matchup.result}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">No recent results</span>
          )}
        </div>
        <Link
          href={view.matchup.href}
          className="shrink-0 text-xs font-medium text-slate-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Open matchup
        </Link>
      </div>
    </section>
  );
}

function DraftPanel({
  view,
}: {
  view: NonNullable<ReturnType<typeof useOwnerCommandCenter>["data"]>;
}) {
  return (
    <section
      aria-labelledby="owner-draft-summary-heading"
      className="rounded-lg border border-slate-200 p-3 sm:p-4"
    >
      <div id="owner-draft-summary-heading">
        <SectionHeading
          icon={ClipboardList}
          title="Draft capital"
          detail={`${view.draft.count} picks`}
        />
      </div>
      {view.draft.groups.length ? (
        <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
          {view.draft.groups.map((group) => (
            <li
              key={group.seasonId}
              className="flex items-center justify-between gap-3 py-2 text-xs"
            >
              <div>
                <p className="font-medium text-slate-900">{group.seasonName}</p>
                <p className="text-slate-400">
                  {group.rounds
                    .map((round) => `R${round.round} ×${round.count}`)
                    .join(" · ")}
                </p>
              </div>
              <span className="font-mono font-semibold text-slate-700">
                {group.picks}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-y border-slate-100 py-4 text-xs text-slate-500">
          No unspent draft picks are assigned to this franchise.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {view.draft.acquired > 0
          ? `${view.draft.acquired} acquired pick${view.draft.acquired === 1 ? "" : "s"} in the current inventory.`
          : "No acquired picks in the current inventory."}
      </p>
    </section>
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
      className="rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:p-4"
    >
      <div id="owner-inbox-summary-heading">
        <SectionHeading
          icon={Bell}
          title="Offers & activity"
          detail={unreadCount ? `${unreadCount} new` : "Caught up"}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-100 py-2 text-center">
        <div>
          <dt className="text-[10px] text-slate-400">UFA offers</dt>
          <dd className="font-mono text-sm font-semibold text-slate-950">
            {view.offers.length}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-slate-400">Your listings</dt>
          <dd className="font-mono text-sm font-semibold text-slate-950">
            {view.listedPlayers.length}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-slate-400">Trade leads</dt>
          <dd className="font-mono text-sm font-semibold text-slate-950">
            {view.activity.filter((item) => item.kind === "trade").length}
          </dd>
        </div>
      </dl>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Pending decisions
          </p>
          {view.offers.length || view.listedPlayers.length ? (
            <ul className="mt-1 divide-y divide-slate-100">
              {view.offers.slice(0, 3).map((offer) => (
                <li key={offer.id} className="py-2 text-xs">
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
                <li key={listing.listingId} className="py-2 text-xs">
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
            <p className="mt-2 text-xs text-slate-500">
              No pending UFA offers or active player listings.
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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
                  <li key={item.id} className="py-2 text-xs">
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
            <p className="mt-2 text-xs text-slate-500">
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

  if (!commandCenter.isEligible) return null;
  if (commandCenter.isLoading) return <OwnerCommandCenterSkeleton />;
  if (!commandCenter.data) {
    return (
      <section className="mx-auto w-full max-w-5xl border-y border-slate-200 py-4 text-sm text-slate-500">
        Your team summary is unavailable right now.
      </section>
    );
  }

  const view = commandCenter.data;
  return (
    <section
      aria-labelledby="owner-command-center-heading"
      className="mx-auto w-full max-w-5xl border-y border-slate-300 py-3 sm:py-4"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <TeamMark team={view.team} size={52} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              My Team · {view.season?.name ?? "Current season"}
            </p>
            <h2
              id="owner-command-center-heading"
              className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl"
            >
              {view.team?.name ?? `${view.ownerName}'s team`}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {view.roster.count}/{view.roster.capacity} players
              {view.cap[0]
                ? ` · ${formatMoney(view.cap[0].remaining)} available`
                : ""}
              {commandCenter.unreadCount
                ? ` · ${commandCenter.unreadCount} new`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Shield className="h-4 w-4" aria-hidden="true" />
          Owner command center
        </div>
      </header>

      <nav
        aria-label="My Team actions"
        className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        <CommandAction
          href={view.actions.exploreTrade}
          icon={ArrowRightLeft}
          label="Explore trade"
          primary
        />
        <CommandAction
          href={view.actions.listPlayer}
          icon={ListPlus}
          label="List player"
          count={view.listedPlayers.length}
        />
        <CommandAction
          href={view.actions.reviewOffer}
          icon={CircleDollarSign}
          label="Review offer"
          count={view.offers.length}
        />
        <CommandAction
          href={view.actions.viewMatchup}
          icon={CalendarDays}
          label="View matchup"
        />
      </nav>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <RosterPanel view={view} />
        <CapPanel view={view} />
        <MatchupPanel view={view} />
        <DraftPanel view={view} />
        <InboxPanel
          view={view}
          lastViewedAt={commandCenter.lastViewedAt}
          unreadCount={commandCenter.unreadCount}
          onMarkRead={commandCenter.markActivityRead}
        />
      </div>
    </section>
  );
}

function OwnerCommandCenterSkeleton() {
  return (
    <section
      aria-label="Loading My Team command center"
      aria-busy="true"
      className="mx-auto w-full max-w-5xl border-y border-slate-300 py-3 sm:py-4"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-[52px] w-[52px] rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-6 w-52 max-w-[80%]" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-11 rounded-md lg:h-9" />
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn("h-48 rounded-lg", index === 4 && "sm:col-span-2")}
          />
        ))}
      </div>
    </section>
  );
}

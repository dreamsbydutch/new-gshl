"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  ListPlus,
  Users,
} from "lucide-react";

import { lighten, useTeamPalette } from "@gshl-hooks";
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
  mobileLabel,
  count,
}: {
  href: string;
  icon: typeof ArrowRightLeft;
  label: string;
  mobileLabel?: string;
  count?: number;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="relative h-9 min-w-0 justify-center gap-1.5 bg-white/80 px-1.5 hover:bg-white sm:justify-between sm:px-2"
    >
      <Link href={href} aria-label={label}>
        <span className="flex min-w-0 items-center justify-center gap-1.5 sm:justify-start">
          <Icon aria-hidden="true" />
          <span className="truncate sm:hidden">{mobileLabel ?? label}</span>
          <span className="hidden truncate sm:inline">{label}</span>
        </span>
        {count ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 ring-1 ring-white sm:static sm:ring-0">
            {count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

function SnapshotMetric({
  label,
  value,
  detail,
  className,
  critical = false,
}: {
  label: string;
  value: string;
  detail: string;
  className?: string;
  critical?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 px-2 py-0.5 first:pl-0 sm:px-2.5 sm:first:pl-0",
        className,
      )}
    >
      <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate font-mono text-sm font-semibold leading-tight text-slate-950",
          critical && "text-rose-700",
        )}
      >
        {value}
      </dd>
      <dd className="truncate text-[10px] leading-tight text-slate-500">
        {detail}
      </dd>
    </div>
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
      className="rounded-lg border border-slate-200 p-2"
    >
      <div id="owner-roster-summary-heading">
        <SectionHeading
          icon={Users}
          title="Roster"
          detail={`${roster.count}/${roster.capacity}`}
        />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
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
      <div className="mt-2 flex flex-wrap gap-1 text-xs">
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
      <details className="mt-2 border-t border-slate-100 pt-1.5">
        <summary className="flex min-h-9 cursor-pointer items-center text-xs font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          View current roster
        </summary>
        <ul className="grid gap-x-4 divide-y divide-slate-100 sm:grid-cols-2 sm:[&>li:nth-child(2)]:border-t-0">
          {roster.players.map((player) => (
            <li
              key={player.id}
              className="flex min-w-0 items-center justify-between gap-3 py-1.5 text-xs"
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
      className="rounded-lg border border-slate-200 p-2"
    >
      <div id="owner-cap-summary-heading">
        <SectionHeading
          icon={CircleDollarSign}
          title="Cap & contracts"
          detail={`${view.contractDecisions.length} decisions`}
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
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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
  const next = view.matchup.next;
  const record = view.matchup.record;
  return (
    <section
      aria-labelledby="owner-matchup-summary-heading"
      className="rounded-lg border border-slate-200 p-2"
    >
      <div id="owner-matchup-summary-heading">
        <SectionHeading
          icon={CalendarDays}
          title="Matchup"
          detail={`${record.wins}-${record.losses}-${record.ties}`}
        />
      </div>
      {next ? (
        <div className="mt-2 flex items-center gap-2 border-y border-slate-100 py-2">
          <TeamMark team={next.opponent} size={38} />
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
        <p className="mt-2 border-y border-slate-100 py-3 text-xs text-slate-500">
          No upcoming matchup is scheduled.
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
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
      className="rounded-lg border border-slate-200 p-2"
    >
      <div id="owner-draft-summary-heading">
        <SectionHeading
          icon={ClipboardList}
          title="Draft capital"
          detail={`${view.draft.count} picks`}
        />
      </div>
      {view.draft.groups.length ? (
        <ul className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
          {view.draft.groups.map((group) => (
            <li
              key={group.seasonId}
              className="flex items-center justify-between gap-3 py-1.5 text-xs"
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
        <p className="mt-2 border-y border-slate-100 py-3 text-xs text-slate-500">
          No unspent draft picks are assigned to this franchise.
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-500">
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
      className="rounded-lg border border-slate-200 p-2 sm:col-span-2"
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
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
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
  const teamPalette = useTeamPalette(commandCenter.data?.team?.logoUrl);

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
  const primaryCap = view.cap[0] ?? null;
  const rosterDetail = view.roster.gaps.length
    ? `Need ${view.roster.gaps
        .map((gap) => `${gap.label} ×${gap.missing}`)
        .join(", ")}`
    : view.roster.composition
        .map((entry) => `${entry.position} ${entry.count}`)
        .join(" · ");
  const nextMatchup = view.matchup.next;
  const opponentName =
    nextMatchup?.opponent?.abbr ?? nextMatchup?.opponent?.name ?? "Not set";
  const marketCount = view.offers.length + view.listedPlayers.length;
  const headerPrimary = teamPalette.primary ?? "#64748b";
  const headerSecondary =
    teamPalette.secondary ?? teamPalette.accent ?? headerPrimary;

  return (
    <section
      aria-labelledby="owner-command-center-heading"
      className="mx-auto w-full max-w-5xl border-y border-slate-300 py-1.5"
    >
      <header
        className="flex flex-wrap items-center justify-between gap-1.5 rounded-md border px-2 py-1"
        style={{
          backgroundImage: `linear-gradient(180deg, ${lighten(headerPrimary, 0.68)} 0%, ${lighten(headerSecondary, 0.86)} 100%)`,
          borderColor: lighten(headerPrimary, 0.45),
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TeamMark team={view.team} size={36} />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-slate-600">
              My Team · {view.season?.name ?? "Current season"}
            </p>
            <h2
              id="owner-command-center-heading"
              className="truncate text-base font-bold leading-tight tracking-tight text-slate-950"
            >
              {view.team?.name ?? `${view.ownerName}'s team`}
            </h2>
          </div>
        </div>

        <nav
          aria-label="My Team actions"
          className="grid w-full grid-cols-4 gap-1 sm:w-auto"
        >
          <CommandAction
            href={view.actions.exploreTrade}
            icon={ArrowRightLeft}
            label="Trade market"
            mobileLabel="Trade"
          />
          <CommandAction
            href={view.actions.listPlayer}
            icon={ListPlus}
            label="List player"
            mobileLabel="List"
            count={view.listedPlayers.length}
          />
          <CommandAction
            href={view.actions.reviewOffer}
            icon={CircleDollarSign}
            label="UFA offers"
            mobileLabel="Offers"
            count={view.offers.length}
          />
          <CommandAction
            href={view.actions.viewMatchup}
            icon={CalendarDays}
            label="Matchup"
          />
        </nav>
      </header>

      <dl
        aria-label="My Team snapshot"
        className="mt-1.5 grid grid-cols-6 border-y border-slate-100 py-0.5 sm:grid-cols-5"
      >
        <SnapshotMetric
          className="col-span-2 sm:col-span-1"
          label="Roster"
          value={`${view.roster.count}/${view.roster.capacity}`}
          detail={rosterDetail}
        />
        <SnapshotMetric
          className="col-span-2 border-l border-slate-200 sm:col-span-1"
          label="Cap space"
          value={primaryCap ? formatMoney(primaryCap.remaining, true) : "—"}
          detail={`${view.contractDecisions.length} contract decision${view.contractDecisions.length === 1 ? "" : "s"}`}
          critical={Boolean(primaryCap && primaryCap.remaining < 0)}
        />
        <SnapshotMetric
          className="col-span-2 border-l border-slate-200 sm:col-span-1"
          label="Next matchup"
          value={opponentName}
          detail={
            nextMatchup
              ? `${view.matchup.record.wins}-${view.matchup.record.losses}-${view.matchup.record.ties} · ${nextMatchup.weekNum ? `W${nextMatchup.weekNum}` : shortDate(nextMatchup.weekStartDate)}`
              : "No game scheduled"
          }
        />
        <SnapshotMetric
          className="col-span-3 pl-0 sm:col-span-1 sm:border-l sm:border-slate-200 sm:pl-2.5"
          label="Draft"
          value={`${view.draft.count} pick${view.draft.count === 1 ? "" : "s"}`}
          detail={
            view.draft.acquired
              ? `${view.draft.acquired} acquired`
              : `${view.draft.groups.length} season${view.draft.groups.length === 1 ? "" : "s"}`
          }
        />
        <SnapshotMetric
          className="col-span-3 border-l border-slate-200 sm:col-span-1"
          label="Market"
          value={`${marketCount} active`}
          detail={`${view.offers.length} offers · ${view.listedPlayers.length} listed${commandCenter.unreadCount ? ` · ${commandCenter.unreadCount} new` : ""}`}
        />
      </dl>

      <details className="group">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-slate-600 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>Team details</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate text-[10px] font-normal text-slate-400 sm:inline">
              Roster, cap, schedule, picks, and activity
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </span>
        </summary>
        <div className="grid gap-1.5 border-t border-slate-100 pt-1.5 sm:grid-cols-2">
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
      </details>
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
        <div className="grid w-full grid-cols-4 gap-1 sm:w-auto">
          {Array.from({ length: 4 }).map((_, index) => (
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

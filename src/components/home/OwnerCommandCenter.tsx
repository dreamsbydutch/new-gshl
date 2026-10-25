"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightLeft, CircleDollarSign } from "lucide-react";
import { lighten, useTeamPalette } from "@gshl-hooks";
import { useOwnerCommandCenter } from "@gshl-hooks/features/useOwnerCommandCenter";
import { Button, Skeleton } from "@gshl-ui";
import { cn, formatMoney } from "@gshl-utils";

function shortDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value,
  );
  if (Number.isNaN(date.getTime())) return null;
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
}: {
  href: string;
  icon: typeof ArrowRightLeft;
  label: string;
  count?: number;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="h-9 min-w-0 justify-center gap-1 bg-white/80 px-1 text-xs hover:bg-white sm:px-2"
    >
      <Link href={href} aria-label={count ? `${label} (${count})` : label}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{label}</span>
        {count ? (
          <span className="hidden shrink-0 rounded-full bg-slate-100 px-1 py-0.5 font-mono text-xs leading-none text-slate-600 sm:inline">
            {count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

function SnapshotLink({
  label,
  value,
  detail,
  href,
  critical = false,
}: {
  label: string;
  value: string;
  detail?: string | null;
  href: string;
  critical?: boolean;
}) {
  return (
    <Link
      href={href}
      className="min-w-0 rounded-md px-2 py-2 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-3"
    >
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span
        className={cn(
          "block truncate text-sm font-semibold leading-6 text-slate-950",
          critical && "text-rose-700",
        )}
      >
        {value}
      </span>
      {detail ? (
        <span className="block truncate text-xs text-slate-500">{detail}</span>
      ) : null}
    </Link>
  );
}

export function OwnerCommandCenter() {
  const commandCenter = useOwnerCommandCenter();
  const teamPalette = useTeamPalette(commandCenter.data?.team?.logoUrl);
  if (!commandCenter.isEligible) return null;
  if (commandCenter.isLoading) return <OwnerCommandCenterSkeleton />;
  if (!commandCenter.data) {
    return (
      <section className="mx-auto w-full max-w-5xl rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Your team summary is unavailable right now.
      </section>
    );
  }

  const view = commandCenter.data;
  const primaryCap = view.cap[0] ?? null;
  const nextMatchup = view.matchup.next;
  const headerPrimary = teamPalette.primary ?? "#64748b";
  const headerSecondary =
    teamPalette.secondary ?? teamPalette.accent ?? headerPrimary;
  const rosterNeeds = view.roster.gaps
    .map((gap) => `${gap.label} x${gap.missing}`)
    .join(", ");
  const nextDate = shortDate(nextMatchup?.weekStartDate);
  const matchupDetail = [
    nextMatchup?.weekNum ? `Week ${nextMatchup.weekNum}` : null,
    nextDate,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <section
      aria-labelledby="owner-command-center-heading"
      className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2"
        style={{
          backgroundImage: `linear-gradient(180deg, ${lighten(headerPrimary, 0.75)} 0%, ${lighten(headerSecondary, 0.92)} 100%)`,
          borderColor: lighten(headerPrimary, 0.55),
        }}
      >
        <Link
          href={view.actions.viewRoster}
          className="flex min-w-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <TeamMark team={view.team} size={36} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              My team &middot; {view.season?.name ?? "Current season"}
            </p>
            <h2
              id="owner-command-center-heading"
              className="truncate font-oswald text-lg text-slate-950 sm:text-xl"
            >
              {view.team?.name ?? `${view.ownerName}'s team`}
            </h2>
          </div>
        </Link>
        <nav aria-label="My Team actions" className="flex flex-wrap gap-2">
          {view.primaryActions.map((action) => (
            <CommandAction
              key={action.kind}
              href={action.href}
              icon={action.kind === "trade" ? ArrowRightLeft : CircleDollarSign}
              label={action.label}
              count={action.count}
            />
          ))}
        </nav>
      </header>
      <nav
        aria-label="My Team overview"
        className={cn(
          "grid gap-1 p-1",
          nextMatchup ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3",
        )}
      >
        <SnapshotLink
          label="Roster"
          value={`${view.roster.count} / ${view.roster.capacity}`}
          detail={
            rosterNeeds
              ? `Needs ${rosterNeeds}`
              : view.roster.openSpots > 0
                ? `${view.roster.openSpots} open spots`
                : null
          }
          href={view.actions.viewRoster}
        />
        <SnapshotLink
          label="Cap space"
          value={
            primaryCap ? formatMoney(primaryCap.remaining, true) : "\u2014"
          }
          detail={
            view.contractDecisions.length
              ? `${view.contractDecisions.length} expiring contract${view.contractDecisions.length === 1 ? "" : "s"}`
              : null
          }
          critical={Boolean(primaryCap && primaryCap.remaining < 0)}
          href={view.actions.viewContracts}
        />
        {nextMatchup ? (
          <SnapshotLink
            label="Next matchup"
            value={nextMatchup.opponent?.name ?? "Opponent TBD"}
            detail={matchupDetail}
            href={nextMatchup.href}
          />
        ) : null}
        <SnapshotLink
          label="Draft picks"
          value={String(view.draft.count)}
          detail={
            view.draft.acquired ? `${view.draft.acquired} acquired` : null
          }
          href={view.actions.viewDraftPicks}
        />
      </nav>
    </section>
  );
}

function OwnerCommandCenterSkeleton() {
  return (
    <section
      aria-label="Loading My Team overview"
      aria-busy="true"
      className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200"
    >
      <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-1 p-1 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 px-2 py-2 sm:px-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-4 w-20 max-w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

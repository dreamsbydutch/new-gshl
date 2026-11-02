"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { useAuthSession, useLeagueActivity } from "@gshl-hooks";
import { LeagueActivityRowsSkeleton } from "@gshl-skeletons";
import type { LeagueActivityEvent, LeagueActivityType } from "@gshl-types";
import type { LeagueTradeSummary } from "@gshl-lib/types/trades";
import {
  formatMoney,
  HOME_LEAGUE_ACTIVITY_QUERY_LIMIT,
  selectHomeLeagueActivity,
  showDate,
} from "@gshl-utils";
import {
  buildWhatsAppShareMessage,
  canShareOwnerContent,
} from "@gshl-utils/features/whatsapp-share";

const groups = [
  { type: "add", label: "Adds" },
  { type: "drop", label: "Drops" },
  { type: "trade", label: "Trades" },
  { type: "signing", label: "Signings" },
] as const;

function activityDetail(event: LeagueActivityEvent): string {
  const terms = [
    event.contractLength
      ? `${event.contractLength} ${event.contractLength === 1 ? "year" : "years"}`
      : null,
    event.contractSalary ? formatMoney(event.contractSalary, true) : null,
    event.signingStatus,
  ].filter(Boolean);
  return [event.teamName, terms.join(" / ")].filter(Boolean).join(" · ");
}

function TradeActivityRow({ trade }: { trade: LeagueTradeSummary }) {
  return (
    <li className="space-y-2 py-3">
      <time
        dateTime={trade.date}
        className="block text-right text-xs text-slate-400"
      >
        {showDate(trade.date)}
      </time>
      <div className="grid gap-3 sm:grid-cols-2">
        {[trade.teamA, trade.teamB].map((team) => {
          const players = trade.players.filter(
            (player) => player.toTeamId === team.id,
          );
          const picks = trade.picks.filter((pick) => pick.toTeamId === team.id);
          return (
            <div
              key={team.id}
              className="rounded-lg border border-blue-100 bg-blue-50/40 p-3"
            >
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                {team.logoUrl ? (
                  <Image
                    src={team.logoUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6 object-contain"
                  />
                ) : null}
                {team.name} receives
              </h4>
              <ul className="space-y-1 text-sm text-slate-700">
                {players.map((player) => (
                  <li key={player.playerId}>{player.playerName}</li>
                ))}
                {picks.map((pick) => (
                  <li key={pick.pickId}>{pick.label}</li>
                ))}
                {!players.length && !picks.length ? (
                  <li className="text-slate-400">—</li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
      {trade.notes ? (
        <p className="text-xs text-slate-500">{trade.notes}</p>
      ) : null}
    </li>
  );
}

function ActivityRow({
  event,
  canShare,
}: {
  event: LeagueActivityEvent;
  canShare: boolean;
}) {
  if (event.trade) return <TradeActivityRow trade={event.trade} />;
  return (
    <li
      className="flex min-w-0 items-center gap-2.5 py-2.5"
      title={`${event.teamName} · ${showDate(event.date)}`}
    >
      {event.teamLogoUrl ? (
        <Image
          src={event.teamLogoUrl}
          alt={event.teamName}
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 object-contain"
        />
      ) : (
        <span
          aria-label={event.teamName}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-semibold text-slate-500"
        >
          {event.teamAbbr ?? "—"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {event.playerName}
        </p>
        {event.type === "signing" || event.type === "trade" ? (
          <p className="line-clamp-2 text-xs leading-4 text-slate-500">
            {activityDetail(event)}
          </p>
        ) : null}
      </div>
      <time
        dateTime={event.date}
        className="sr-only shrink-0 text-xs tabular-nums text-slate-400 sm:not-sr-only"
      >
        {showDate(event.date)}
      </time>
      {event.type === "add" ? (
        <span
          className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700"
          aria-label={
            event.weeklyAddCount == null
              ? "Weekly add count unavailable"
              : `${event.teamName}: ${event.weeklyAddCount} of 4 weekly adds`
          }
        >
          ({event.weeklyAddCount ?? "—"}/4)
        </span>
      ) : null}
      {event.type === "signing" && canShare ? (
        <WhatsAppShareButton
          message={buildWhatsAppShareMessage({
            title: "GSHL Signing",
            summary: `${event.playerName} signed by ${event.teamName}`,
            lines: [activityDetail(event)],
          })}
          path="/"
          label="Share"
          ariaLabel={`Share ${event.playerName} signing to WhatsApp`}
          className="shrink-0"
        />
      ) : null}
    </li>
  );
}

export function LeagueActivityCard({ seasonId }: { seasonId?: string }) {
  const [expanded, setExpanded] = useState<LeagueActivityType[]>([]);
  const { session } = useAuthSession();
  const {
    data: activity,
    isLoading,
    error,
  } = useLeagueActivity(seasonId, HOME_LEAGUE_ACTIVITY_QUERY_LIMIT);
  return (
    <section
      aria-labelledby="league-activity-heading"
      className="h-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <header className="border-b border-slate-100 px-3 py-3 sm:px-5">
        <h2
          id="league-activity-heading"
          className="font-oswald text-lg text-slate-950 sm:text-xl"
        >
          Recent league activity
        </h2>
      </header>
      {isLoading ? (
        <LeagueActivityRowsSkeleton />
      ) : error ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500 sm:px-5">
          League activity is unavailable right now.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map(({ type, label }) => {
            const events = activity.filter((event) => event.type === type);
            if (!events.length && (type === "trade" || type === "signing"))
              return null;
            const isExpanded = expanded.includes(type);
            const visible = selectHomeLeagueActivity(events, isExpanded);
            const hiddenCount = events.length - visible.length;
            return (
              <section
                key={type}
                aria-label={label}
                className="px-3 py-3 sm:px-5"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {label}
                </h3>
                {events.length ? (
                  <ul
                    id={`home-activity-${type}`}
                    className="mt-1 divide-y divide-slate-100"
                  >
                    {visible.map((event) => (
                      <ActivityRow
                        key={event.id}
                        event={event}
                        canShare={canShareOwnerContent(session?.user.role)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-xs text-slate-400">None recently.</p>
                )}
                {hiddenCount > 0 || isExpanded ? (
                  <button
                    type="button"
                    aria-controls={`home-activity-${type}`}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpanded((current) =>
                        current.includes(type)
                          ? current.filter((item) => item !== type)
                          : [...current, type],
                      )
                    }
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {isExpanded ? (
                      <>
                        Show fewer{" "}
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        Show {hiddenCount} more{" "}
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

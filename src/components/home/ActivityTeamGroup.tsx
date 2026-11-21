import Image from "next/image";
import Link from "next/link";
import { Plus, Minus, ArrowLeftRight } from "lucide-react";
import type { LeagueActivityGroup } from "@gshl-lib/types/league-activity";

export function ActivityTeamGroup({
  group,
  href,
  ownId,
  opponentId,
  showCounts = false,
}: {
  group: LeagueActivityGroup;
  href?: string;
  ownId?: string;
  opponentId?: string;
  showCounts?: boolean;
}) {
  const content = (
    <>
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
              {group.teamId === ownId
                ? "Your team: "
                : group.teamId === opponentId
                  ? "Your opponent: "
                  : ""}
            </span>
            {group.teamName || "Trade"}
          </span>
        </div>
        <ul className="space-y-1">
          {group.events.map((event) => (
            <li key={event.id} className="flex items-start gap-1.5">
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
                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
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
                {showCounts &&
                  event.type === "add" &&
                  event.weeklyAddCount != null && (
                    <small className="ml-1 font-normal text-slate-500">
                      ({event.weeklyAddCount}/4)
                    </small>
                  )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
  const className = "flex min-h-11 items-start gap-2 py-2";
  return href ? (
    <Link
      href={href}
      className={
        className + " focus-visible:ring-2 focus-visible:ring-slate-500"
      }
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

"use client";
import Image from "next/image";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { useDraftLiveTvBoard } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import { useDraftPickFlowMotion } from "@gshl-hooks/features/useDraftPickFlowMotion";
import { abbreviatePlayerName, cn } from "@gshl-utils";
import { formatDraftTvClock } from "@gshl-utils/features/draft-tv-clock";
import type { DraftHubPickView } from "@gshl-types";

function PickLogo({
  pick,
  large = false,
}: {
  pick: DraftHubPickView;
  large?: boolean;
}) {
  return pick.team?.logoUrl ? (
    <Image
      src={pick.team.logoUrl}
      alt=""
      width={96}
      height={96}
      className={cn(
        "shrink-0 object-contain",
        large ? "h-[3.5em] w-[3.5em]" : "h-[2em] w-[2em]",
      )}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-slate-300 text-[0.7em] font-semibold text-slate-700",
        large ? "h-[5em] w-[5em]" : "h-[3em] w-[3em]",
      )}
    >
      {pick.team?.abbr ?? "GSHL"}
    </span>
  );
}

export function DraftPickRail({
  picks,
  recent,
  compact = false,
}: {
  picks: DraftHubPickView[];
  recent: boolean;
  compact?: boolean;
}) {
  const { panelRef, contentRef } = useDraftBoardFit();
  const { listRef } = useDraftPickFlowMotion(recent);
  return (
    <section
      ref={panelRef}
      data-tv-fit
      aria-label={recent ? "Recent picks" : "Upcoming picks"}
      className="min-h-0 min-w-0 overflow-hidden"
    >
      <div ref={contentRef} className="w-full">
        <h2
          className={cn(
            "flex items-center justify-center gap-2 border-b-2 text-[0.75em] font-semibold uppercase tracking-wider",
            compact ? "mb-1 py-1" : "mb-2 py-2",
            recent
              ? "border-emerald-600 text-emerald-800"
              : "border-amber-500 text-amber-900",
          )}
        >
          {recent ? (
            <>
              Recent picks{" "}
              <ArrowDown className="h-[1.1em] w-[1.1em]" aria-hidden="true" />
            </>
          ) : (
            <>
              <ArrowUp className="h-[1.1em] w-[1.1em]" aria-hidden="true" />{" "}
              Coming up
            </>
          )}
        </h2>
        <ol
          ref={listRef}
          className={cn("relative", compact ? "space-y-1" : "space-y-2")}
        >
          {picks.map((pick, index) => (
            <li
              key={pick.pick.id}
              data-pick-id={pick.pick.id}
              className={cn(
                "border border-slate-300",
                compact ? "px-1 py-0.5" : "px-3 py-2",
                recent
                  ? "border-l-[3px] border-l-emerald-600 bg-slate-100"
                  : "border-r-[3px] border-r-amber-500 bg-slate-100",
                index === 0 && "bg-slate-50",
              )}
            >
              <p
                className={cn(
                  "flex justify-between text-[0.65em] text-slate-600",
                  compact ? "mb-0.5" : "mb-2",
                )}
              >
                <span>
                  Round {pick.pick.round} &middot; #{pick.pick.pick}
                </span>
                <span>
                  {index === 0
                    ? recent
                      ? "Latest pick"
                      : "Next pick"
                    : recent
                      ? "Selected"
                      : `${index + 1} away`}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <PickLogo pick={pick} />
                <div className="min-w-0">
                  <p
                    className="break-words text-[0.9em] font-semibold"
                    title={recent ? pick.player?.fullName : pick.team?.name}
                    aria-label={recent ? pick.player?.fullName : undefined}
                  >
                    {recent
                      ? pick.player
                        ? abbreviatePlayerName(pick.player.fullName)
                        : "Player unavailable"
                      : (pick.team?.name ?? "Team pending")}
                  </p>
                  {(!compact || recent || pick.pick.isTraded) && (
                    <p
                      className={cn(
                        "break-words text-[0.7em] text-slate-600",
                        compact ? "mt-0.5" : "mt-1",
                      )}
                    >
                      {recent
                        ? (pick.team?.name ?? "Team pending")
                        : pick.pick.isTraded && pick.originalTeam
                          ? `Via ${pick.originalTeam.name}`
                          : "Awaiting selection"}
                    </p>
                  )}
                  {recent && pick.player && !compact && (
                    <p className="mt-1 text-[0.65em] text-slate-600">
                      {pick.player.nhlPos.join(" / ")}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {!picks.length && (
          <p className="px-3 py-5 text-center text-[0.8em] text-slate-600">
            {recent ? "No selections yet" : "No later picks"}
          </p>
        )}
      </div>
    </section>
  );
}

export function DraftLiveHeader({
  draft,
  compact = false,
}: {
  draft: ReturnType<typeof useDraftLiveTvBoard>;
  compact?: boolean;
}) {
  const status = draft.state?.status ?? "unavailable";
  const upcoming = status === "upcoming";
  const expired = status === "commissioner_required";
  const complete = status === "complete";
  const pick = complete || status === "unavailable" ? null : draft.activePick;
  const seconds = upcoming
    ? draft.draftStartRemainingSeconds
    : expired
      ? 0
      : draft.clockRemainingSeconds;
  const Heading = compact ? "h2" : "h1";
  return (
    <header
      className={cn(
        "grid shrink-0 items-center border-y-[3px] bg-slate-100",
        compact
          ? "mb-1 grid-cols-[1fr_auto] gap-2 px-2 py-1"
          : "mb-3 grid-cols-[1.6fr_1fr_0.9fr] gap-4 px-4 py-3",
        expired ? "border-red-500" : "border-slate-800",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {pick && <PickLogo pick={pick} large={!compact} />}
        <div className="min-w-0">
          <p
            className={cn(
              "text-[0.65em] font-semibold uppercase tracking-widest",
              expired ? "text-red-700" : "text-slate-600",
            )}
          >
            {upcoming
              ? "First selection"
              : expired
                ? "Awaiting commissioner"
                : complete
                  ? "Draft complete"
                  : pick
                    ? "On the clock"
                    : "Draft unavailable"}
          </p>
          <Heading
            className={cn(
              "mt-1 break-words font-semibold",
              compact ? "text-[1em]" : "text-[1.45em]",
            )}
          >
            {pick?.team?.name ??
              (complete ? "Every pick is in" : "Waiting for draft data")}
          </Heading>
          {pick && (
            <p className="mt-1 text-[0.75em] text-slate-600">
              Round {pick.pick.round} &middot; Pick {pick.pick.pick}
            </p>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-[0.65em] uppercase tracking-widest text-slate-600">
          {upcoming
            ? "Draft starts in"
            : complete
              ? "Selections"
              : "Pick clock"}
        </p>
        <p
          role="timer"
          className={cn(
            "mt-1 whitespace-nowrap font-mono font-semibold tabular-nums",
            compact ? "text-[1.25em]" : "text-[2em]",
            expired ? "text-red-700" : "text-slate-950",
          )}
        >
          {complete
            ? (draft.state?.completedCount ?? 0)
            : pick
              ? formatDraftTvClock(seconds)
              : "--:--"}
        </p>
      </div>
      {!compact && (
        <div className="text-right text-[0.75em] text-slate-600">
          {upcoming && draft.season?.draftStartAt ? (
            <>
              <p>Draft starts soon</p>
              <p className="mt-1 font-medium text-slate-900">
                {new Date(draft.season.draftStartAt).toLocaleString("en-CA", {
                  timeZone: "America/Toronto",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ET
              </p>
            </>
          ) : (
            <>
              <p>{draft.state?.completedCount ?? 0} picks completed</p>
              <p className="mt-1 text-[1.25em] font-medium text-slate-900">
                {draft.state?.remainingCount ?? 0} remaining
              </p>
            </>
          )}
        </div>
      )}
    </header>
  );
}

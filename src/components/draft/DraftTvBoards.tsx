"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useDraftRosterBoard } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import { buildCurrentRoster, cn } from "@gshl-utils";
import type {
  DraftHubEligiblePlayerView,
  DraftRosterTeamView,
  Player,
} from "@gshl-types";
import { CompactBestAvailableTable } from "./DraftRosterBoard";

function TvFrame({
  title,
  children,
  season,
}: {
  title: string;
  children: ReactNode;
  season?: string;
}) {
  return (
    <main className="flex h-dvh min-h-[500px] flex-col overflow-hidden bg-slate-200 p-3 text-[length:clamp(16px,1.35vw,52px)] leading-tight text-slate-950">
      <header className="mb-3 flex shrink-0 items-center justify-between border-y-[3px] border-slate-800 bg-slate-100 px-3 py-2">
        <div className="flex items-center gap-3">
          {season && (
            <span className="border-r border-slate-300 pr-3 text-[0.8em] font-semibold tracking-[0.16em] text-slate-700">
              GSHL
            </span>
          )}
          <h1 className="text-[1.3em] font-semibold">{title}</h1>
          {season && (
            <span className="ml-2 text-[0.6em] font-semibold uppercase tracking-wider text-slate-600">
              {season}
            </span>
          )}
        </div>
        <nav
          aria-label="TV boards"
          className="flex gap-4 text-[0.65em] font-medium text-slate-700 underline underline-offset-4"
        >
          <Link href="/draft-roster-board">Overview</Link>
          <Link
            href="/draft-roster-board/available"
            aria-current="page"
            className="decoration-amber-500 decoration-2"
          >
            Available
          </Link>
          <Link href="/draft-roster-board/live">Live draft</Link>
        </nav>
      </header>
      {children}
    </main>
  );
}

function AvailablePanel({
  label,
  players,
  limit,
  fillHeight = false,
  className,
}: {
  label: string;
  players: DraftHubEligiblePlayerView[];
  limit?: number;
  fillHeight?: boolean;
  className?: string;
}) {
  const { panelRef, contentRef } = useDraftBoardFit();
  const capacityPanelRef = useRef<HTMLElement>(null);
  const [rowCapacity, setRowCapacity] = useState(26);
  const visiblePlayers = players.slice(
    0,
    fillHeight ? rowCapacity : (limit ?? players.length),
  );
  const title = `Top ${fillHeight ? visiblePlayers.length : (limit ?? visiblePlayers.length)} ${label}`;

  useLayoutEffect(() => {
    if (!fillHeight) return;
    const panel = capacityPanelRef.current;
    if (!panel || !players.length) return;

    const measure = () => {
      const table = panel.querySelector("table");
      const heading = table?.previousElementSibling;
      const tableHead = table?.querySelector("thead");
      const rows = table ? [...table.querySelectorAll("tbody tr")] : [];
      const rowHeight = Math.max(
        1,
        ...rows.map((row) => row.getBoundingClientRect().height),
      );
      const availableHeight =
        panel.clientHeight -
        (heading?.getBoundingClientRect().height ?? 0) -
        (tableHead?.getBoundingClientRect().height ?? 0);
      const nextCapacity = Math.max(
        1,
        Math.min(players.length, Math.floor((availableHeight - 2) / rowHeight)),
      );
      setRowCapacity((current) =>
        current === nextCapacity ? current : nextCapacity,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [fillHeight, players.length, rowCapacity]);

  return (
    <section
      ref={fillHeight ? capacityPanelRef : panelRef}
      aria-label={title}
      className={cn(
        "min-h-0 min-w-0 overflow-hidden border border-slate-300 bg-slate-100",
        className,
      )}
    >
      <div ref={fillHeight ? undefined : contentRef} className="w-full">
        <CompactBestAvailableTable
          title={title}
          players={visiblePlayers}
          broadcast
        />
        {!players.length && <p className="p-2">No available players.</p>}
      </div>
    </section>
  );
}

const POSITION_COLUMNS = ["C", "LW", "RW", "D", "G"] as const;

function TeamPositionTable({
  teams,
  players,
}: {
  teams: DraftRosterTeamView[];
  players: Player[];
}) {
  const { panelRef, contentRef } = useDraftBoardFit();
  const rows = teams.map((team) => {
    const roster = buildCurrentRoster(players, team);
    const counts = Object.fromEntries(
      POSITION_COLUMNS.map((position) => [
        position,
        roster.filter((player) =>
          position === "G"
            ? player.posGroup === "G" ||
              player.nhlPos.some(
                (playerPosition) =>
                  playerPosition.trim().toUpperCase() === position,
              )
            : player.nhlPos.some(
                (playerPosition) =>
                  playerPosition.trim().toUpperCase() === position,
              ),
        ).length,
      ]),
    ) as Record<(typeof POSITION_COLUMNS)[number], number>;
    return { team, counts };
  });

  return (
    <section
      ref={panelRef}
      data-tv-fit
      aria-label="Team position counts"
      className="min-h-0 flex-1 overflow-hidden border border-slate-300 bg-slate-100"
    >
      <div ref={contentRef} className="w-full shrink-0">
        <header className="border-l-4 border-amber-400 bg-slate-200/80 px-2 py-1">
          <h2 className="text-[0.75em] font-semibold uppercase tracking-wider text-slate-800">
            Roster makeup
          </h2>
        </header>
        <table className="w-full text-[0.8em] leading-tight">
          <thead className="border-y border-slate-300 bg-slate-200 text-slate-600">
            <tr>
              <th scope="col" className="px-1 py-0.5 text-left font-medium">
                Team
              </th>
              {POSITION_COLUMNS.map((position) => (
                <th
                  key={position}
                  scope="col"
                  className="px-1 py-0.5 text-center font-medium"
                >
                  {position}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ team, counts }) => (
              <tr
                key={team.id}
                className="border-b border-slate-200 last:border-0 odd:bg-slate-100 even:bg-slate-200/60"
              >
                <th scope="row" className="px-1 py-1 text-left font-medium">
                  <span
                    className="flex items-center gap-1"
                    title={team.name ?? team.abbr ?? "Team"}
                  >
                    {team.logoUrl ? (
                      <Image
                        src={team.logoUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="h-[1.4em] w-[1.4em] object-contain"
                      />
                    ) : (
                      <span className="grid h-[1.4em] w-[1.4em] place-items-center rounded-full bg-slate-300 text-[0.65em]">
                        {team.abbr ?? "?"}
                      </span>
                    )}
                    {team.logoUrl ? (
                      <span className="truncate">{team.abbr ?? team.name}</span>
                    ) : null}
                  </span>
                </th>
                {POSITION_COLUMNS.map((position) => (
                  <td
                    key={position}
                    className="px-1 py-1 text-center tabular-nums"
                  >
                    {counts[position]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DraftAvailableTvBoard() {
  const board = useDraftRosterBoard();
  return (
    <TvFrame
      title="Best available"
      season={board.season?.name ?? "Draft board"}
    >
      {board.isLoading ? (
        <p role="status">Loading players...</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-3">
          <AvailablePanel
            label="skaters"
            fillHeight
            players={board.availablePlayers.filter(
              (player) => player.posGroup !== "G",
            )}
          />
          <div className="flex min-h-0 flex-col gap-3">
            <AvailablePanel
              label="goalies"
              limit={10}
              className="shrink-0"
              players={board.availablePlayers.filter(
                (player) => player.posGroup === "G",
              )}
            />
            <TeamPositionTable
              teams={board.conferences.flatMap(
                (conference) => conference.teams,
              )}
              players={board.players}
            />
          </div>
        </div>
      )}
    </TvFrame>
  );
}

export { DraftLiveTvBoard } from "./DraftLiveTvBoard";

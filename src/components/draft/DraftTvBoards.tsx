"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useDraftRosterBoard } from "@gshl-hooks";
import { useDraftBoardFit } from "@gshl-hooks/features/useDraftBoardFit";
import { cn, getDraftCompositeRanks } from "@gshl-utils";
import type { DraftHubEligiblePlayerView } from "@gshl-types";
import { CompactBestAvailableTable } from "./DraftRosterBoard";

function TvFrame({
  title,
  children,
  season,
  hideHeader = false,
}: {
  title: string;
  children: ReactNode;
  season?: string;
  hideHeader?: boolean;
}) {
  return (
    <main className="flex h-dvh min-h-[500px] flex-col overflow-hidden bg-slate-200 p-3 text-[length:clamp(16px,1.35vw,52px)] leading-tight text-slate-950">
      {hideHeader ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <header className="mb-3 flex shrink-0 items-center border-y-[3px] border-slate-800 bg-slate-100 px-3 py-2">
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
        </header>
      )}
      {children}
    </main>
  );
}

function AvailablePanel({
  label,
  players,
  draftRanks,
  limit,
  fillHeight = false,
  className,
}: {
  label: string;
  players: DraftHubEligiblePlayerView[];
  draftRanks: ReadonlyMap<string, number>;
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
          draftRanks={draftRanks}
          broadcast
        />
        {!players.length && <p className="p-2">No available players.</p>}
      </div>
    </section>
  );
}

export function DraftAvailableTvBoard() {
  const board = useDraftRosterBoard();
  const draftRanks = useMemo(
    () => getDraftCompositeRanks(board.availablePlayers),
    [board.availablePlayers],
  );
  return (
    <TvFrame
      title="Best available"
      season={board.season?.name ?? "Draft board"}
      hideHeader
    >
      {board.isLoading ? (
        <p role="status">Loading players...</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-3">
          <AvailablePanel
            label="skaters"
            fillHeight
            draftRanks={draftRanks}
            players={board.availablePlayers.filter(
              (player) => player.posGroup !== "G",
            )}
          />
          <AvailablePanel
            label="goalies"
            fillHeight
            draftRanks={draftRanks}
            players={board.availablePlayers.filter(
              (player) => player.posGroup === "G",
            )}
          />
        </div>
      )}
    </TvFrame>
  );
}

export { DraftLiveTvBoard } from "./DraftLiveTvBoard";

"use client";

import { useState } from "react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { TableViewport } from "@gshl-ui";
import type { buildNHLGameEvents } from "@gshl-utils/features/nhl-events";

export function NHLGameEvents({
  events,
  available,
  upcoming,
  rosterLoading,
  rosterError,
}: {
  events: ReturnType<typeof buildNHLGameEvents>;
  available: boolean;
  upcoming: boolean;
  rosterLoading: boolean;
  rosterError?: string;
}) {
  const [filter, setFilter] = useState<"goals" | "penalties">("goals");
  const goals = filter === "goals";
  const visibleEvents = events.filter((event) =>
    goals ? event.title !== "Penalty" : event.title === "Penalty",
  );
  const headings = goals
    ? ["Period", "Time", "Team", "Scorer", "Assists", "Goalie", "Score"]
    : ["Period", "Time", "Team", "Player", "Penalty", "Drawn by", "Served by"];

  const renderPlayers = (event: (typeof events)[number], role: string) => {
    const players = event.participants.filter((player) => player.role === role);
    if (!players.length) return role === "Assist" ? "Unassisted" : "—";
    return players.map((player, index) => (
      <span
        key={`${role}-${index}`}
        className="inline-flex items-center gap-1 whitespace-nowrap"
      >
        {index > 0 ? <span className="mr-1">,</span> : null}
        {player.isGshl ? (
          <strong className="font-bold">{player.name}</strong>
        ) : (
          player.name
        )}
      </span>
    ));
  };

  return (
    <section
      aria-labelledby="game-events-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl"
    >
      <header className="space-y-3 border-b border-slate-200 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="game-events-heading"
            className="font-oswald text-xl text-slate-900"
          >
            Game events
          </h2>
          <div
            role="group"
            aria-label="Game event type"
            className="inline-flex rounded-lg border border-slate-300 p-0.5"
          >
            {(["goals", "penalties"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                aria-controls="game-events-table"
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-md px-4 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${filter === value ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-100"}`}
              >
                {value === "goals" ? "Goals" : "Penalties"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-800">
          Times elapsed in each period. Bold names are GSHL players.
        </p>
        {rosterLoading ? (
          <p role="status" className="text-xs text-slate-800">
            Loading GSHL players…
          </p>
        ) : rosterError ? (
          <p className="text-xs text-slate-800">
            GSHL player highlighting is temporarily unavailable.
          </p>
        ) : null}
      </header>
      <TableViewport
        ariaLabel="Game events"
        scrollHint="Scroll to see all event details"
        viewportClassName="rounded-none border-0 focus-visible:ring-inset focus-visible:ring-offset-0"
      >
        <table
          id="game-events-table"
          className="w-full whitespace-nowrap text-left text-xs text-slate-900 sm:text-sm"
        >
          <caption className="sr-only">
            {goals ? "Goals" : "Penalties"} in chronological order. One row per
            event.
          </caption>
          <thead className="bg-slate-100">
            <tr>
              {headings.map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-3 py-2 font-semibold"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((event) => (
              <tr
                key={event.id}
                className="border-t border-slate-200 odd:bg-white even:bg-slate-50"
              >
                <td className="px-3 py-2 tabular-nums">{event.period}</td>
                <td className="px-3 py-2 tabular-nums">{event.time}</td>
                <td className="px-3 py-2">
                  {event.team ? (
                    <NHLLogo
                      team={{ name: event.team, logoUrl: "" }}
                      size={22}
                      className="!mx-0"
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {renderPlayers(event, goals ? "Scorer" : "By")}
                </td>
                <td className="px-3 py-2">
                  {goals
                    ? event.title === "Shootout goal"
                      ? "Shootout"
                      : renderPlayers(event, "Assist")
                    : event.description || "—"}
                </td>
                <td className="px-3 py-2">
                  {renderPlayers(event, goals ? "Against" : "Drawn by")}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {goals
                    ? (event.score ?? "—")
                    : renderPlayers(event, "Served by")}
                </td>
              </tr>
            ))}
            {!visibleEvents.length ? (
              <tr>
                <td
                  colSpan={headings.length}
                  className="whitespace-normal px-4 py-6 text-center text-slate-800"
                >
                  {upcoming
                    ? "Game events will appear once play begins."
                    : available
                      ? `No ${filter} recorded yet.`
                      : "Game events are temporarily unavailable."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableViewport>
    </section>
  );
}

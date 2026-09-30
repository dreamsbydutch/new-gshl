"use client";
import { Component, type ReactNode } from "react";
import { Button } from "@gshl-ui";
import { useNormalizedNhlRosters } from "../../hooks/features/useNormalizedNhlRosters";

const dollars = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
class RosterBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="rounded-lg border p-6">
        <p>
          NHL rosters could not load. Check your connection and commissioner
          access.
        </p>
        <Button
          className="mt-3"
          onClick={() => this.setState({ failed: false })}
        >
          Try again
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function NormalizedNhlRosters() {
  return (
    <RosterBoundary>
      <RosterContent />
    </RosterBoundary>
  );
}
function RosterContent() {
  const view = useNormalizedNhlRosters();
  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold">NHL team normalized cap hits</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Current roster assignments · {view.seasonStartYear}–
          {String(view.seasonStartYear + 1).slice(-2)} contracts. Each player’s
          normalized AAV averages their full contract at a $100 million cap,
          using your saved season ceilings. Team totals add those values.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Shows active players with stored NHL team assignments, including
          contracted prospects. These roster totals do not include retained
          salary, buyouts, or other team cap adjustments. Update players from
          PuckPedia to refresh assignments.
        </p>
      </div>
      {view.isLoading ? (
        <p role="status" className="rounded-lg border p-6">
          Loading complete rosters… {view.loaded.toLocaleString()} players
          loaded.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Find a team or player
              </span>
              <input
                className="w-full rounded border px-3 py-2 sm:w-80"
                value={view.search}
                onChange={(event) => view.setSearch(event.target.value)}
                placeholder="Team or player name"
              />
            </label>
            <p className="text-sm text-muted-foreground">
              {view.teamCount} teams · {view.playerCount} players
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Complete totals appear first, highest to lowest. Search keeps each
            matching team’s full roster and total.
          </p>
          {!view.teams.length ? (
            <p>No teams or players match your search.</p>
          ) : null}
          {view.teams.map((team) => (
            <details
              key={team.id}
              className="rounded-lg border"
              open={view.search.trim() ? true : undefined}
            >
              <summary className="cursor-pointer p-4">
                <span className="font-semibold">{team.name}</span>
                <span className="ml-3 text-sm">
                  {team.roster.length} players ·{" "}
                  {team.roster.length ? dollars(team.normalizedTotal) : "—"}{" "}
                  normalized {team.complete ? "total" : "subtotal"}
                </span>
                {!team.complete && team.roster.length ? (
                  <span className="ml-3 text-sm text-amber-700">
                    Incomplete: {team.missing} players need data or review
                  </span>
                ) : null}
              </summary>
              {team.roster.length ? (
                <div className="overflow-x-auto px-4 pb-4">
                  <table className="w-full min-w-[600px] text-sm">
                    <caption className="sr-only">
                      {team.name} roster and normalized cap hits
                    </caption>
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Player</th>
                        <th className="p-2">Position</th>
                        <th className="p-2">Contract</th>
                        <th className="p-2 text-right">Season cap hit</th>
                        <th className="p-2 text-right">Normalized AAV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.roster.map((player) => (
                        <tr key={player.id} className="border-b">
                          <th scope="row" className="p-2 text-left font-medium">
                            {player.playerName}
                          </th>
                          <td className="p-2">{player.position}</td>
                          <td className="p-2">
                            {player.contract
                              ? `${player.contract.startSeasonStartYear}–${String(player.contract.expirySeasonStartYear + 1).slice(-2)}`
                              : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {dollars(player.capHit)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {dollars(player.normalizedAav)}
                            {player.reason ? (
                              <div className="text-xs text-amber-700">
                                {player.reason}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <th colSpan={3} className="p-2 text-left">
                          Roster {team.complete ? "total" : "subtotal"}
                        </th>
                        <td className="p-2 text-right tabular-nums">
                          {dollars(team.capHitTotal)}
                          {team.missingCapHits ? " (partial)" : ""}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {dollars(team.normalizedTotal)}
                          {!team.complete ? " (partial)" : ""}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  No active players with this team assignment are stored.
                </p>
              )}
            </details>
          ))}
        </>
      )}
    </section>
  );
}

"use client";

import { Component, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Button } from "@gshl-ui";
import { useNhlPlayerGarRankings } from "../../hooks/features/useNhlPlayerGarRankings";

const season = (year: number) => `${year}–${String(year + 1).slice(-2)}`;
const score = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

const ProjectedTalent = dynamic(
  () =>
    import("./NhlProjectedTalentRankings").then(
      (m) => m.NhlProjectedTalentRankings,
    ),
  { loading: () => <p role="status">Loading talent model…</p> },
);

class PlayerGarBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert" className="rounded-xl border p-6">
        <p>
          Player ratings could not load. Check your connection and try again.
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

export function NhlPlayerGarRankings() {
  const [basis, setBasis] = useState<"recorded" | "talent">("recorded");
  return (
    <PlayerGarBoundary>
      <div className="space-y-5">
        <div
          role="group"
          aria-label="Player rating basis"
          className="flex flex-wrap gap-2"
        >
          <Button
            variant={basis === "recorded" ? "default" : "outline"}
            aria-pressed={basis === "recorded"}
            onClick={() => setBasis("recorded")}
          >
            Recorded contribution
          </Button>
          <Button
            variant={basis === "talent" ? "default" : "outline"}
            aria-pressed={basis === "talent"}
            onClick={() => setBasis("talent")}
          >
            Projected talent
          </Button>
        </div>
        {basis === "recorded" ? <PlayerGarTable /> : <ProjectedTalent />}
      </div>
    </PlayerGarBoundary>
  );
}

function PlayerGarTable() {
  const view = useNhlPlayerGarRankings();
  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Recorded NHL player GAR</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Recorded season contribution estimated in goals above replacement.
          Forwards, defensemen, and goalies share the same scale. Zero is
          replacement level; players without a qualified rating remain unrated.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Season</span>
          <select
            className="rounded border bg-background px-3 py-2"
            value={view.selected?.seasonStartYear ?? ""}
            onChange={(event) => view.changeYear(Number(event.target.value))}
            disabled={!view.seasons?.length}
          >
            {!view.seasons?.length && (
              <option value="">No seasons available</option>
            )}
            {view.seasons?.map((row) => (
              <option key={row.id} value={row.seasonStartYear}>
                {season(row.seasonStartYear)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Position</span>
          <select
            className="rounded border bg-background px-3 py-2"
            value={view.position}
            onChange={(event) => view.changePosition(event.target.value)}
          >
            <option value="all">All positions</option>
            <option value="F">Forwards</option>
            <option value="D">Defensemen</option>
            <option value="G">Goalies</option>
          </select>
        </label>
        <label className="min-w-0 flex-1 text-sm">
          <span className="mb-1 block font-medium">Find a player or team</span>
          <input
            className="w-full rounded border bg-background px-3 py-2"
            value={view.search}
            onChange={(event) => view.changeSearch(event.target.value)}
            placeholder="Player name or NHL team"
            type="search"
          />
        </label>
      </div>
      {view.isLoading ? (
        <p role="status" className="rounded-xl border p-6">
          Loading player ratings…
        </p>
      ) : (
        <>
          {view.population && !view.population.populationComplete && (
            <p className="text-sm text-muted-foreground">
              This season’s coverage is incomplete. Available ratings are shown;
              missing ratings are not treated as zero.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full whitespace-nowrap text-sm">
              <caption className="sr-only">
                {view.selected ? season(view.selected.seasonStartYear) : "NHL"}{" "}
                player contribution ranked by total GAR
              </caption>
              <thead className="bg-muted">
                <tr>
                  {[
                    "Rank",
                    "Player",
                    "Pos",
                    "Team",
                    "GP",
                    "GAR",
                    "Observed GAR/60",
                    "GAR/82",
                  ].map((label) => (
                    <th key={label} scope="col" className="px-4 py-3 text-left">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.playerId} className="border-t">
                    <td className="px-4 py-3 tabular-nums">
                      {row.rank ?? "—"}
                    </td>
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {row.name}
                    </th>
                    <td className="px-4 py-3">{row.position}</td>
                    <td className="px-4 py-3">
                      {row.teams.join(" / ") || "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.games}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {score(row.goalsAboveReplacement)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {score(row.gar60)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {score(row.gar82)}
                    </td>
                  </tr>
                ))}
                {!view.rows.length && (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-6 text-center text-muted-foreground"
                    >
                      No players match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {view.total.toLocaleString()} players · Page {view.page + 1} of{" "}
              {view.pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={view.page === 0}
                onClick={() => view.setPage(view.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={view.page + 1 >= view.pageCount}
                onClick={() => view.setPage(view.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            GAR/82 adjusts for the NHL season’s schedule length, not the
            player’s games played.
          </p>
        </>
      )}
    </section>
  );
}

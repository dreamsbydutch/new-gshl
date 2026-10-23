"use client";
import { Button } from "@gshl-ui";
import { useNhlProjectedTalentRankings } from "../../hooks/features/useNhlProjectedTalentRankings";

const score = (n: number | null | undefined, decimals = 2) =>
  n === null || n === undefined
    ? "—"
    : `${n > 0 ? "+" : ""}${n.toFixed(decimals)}`;
const season = (year: number) => `${year - 1}–${String(year).slice(-2)}`;
export function NhlProjectedTalentRankings() {
  const view = useNhlProjectedTalentRankings();
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Projected talent when playing</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          GAR per 60 minutes estimates playing ability, independent of expected
          games played. Missed seasons add uncertainty; they are not
          zero-performance observations.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Preseason {season(view.cutoffYear + 1)} estimate using completed
          seasons through {season(view.cutoffYear)}. Current-season play and
          medical recovery forecasts are not included.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Position</span>
          <select
            className="rounded border bg-background px-3 py-2"
            value={view.position}
            onChange={(e) => view.changePosition(e.target.value)}
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
            type="search"
            className="w-full rounded border bg-background px-3 py-2"
            placeholder="Player name or NHL team"
            value={view.search}
            onChange={(e) => view.changeSearch(e.target.value)}
          />
        </label>
      </div>
      {view.stale ? (
        <p role="status">
          The talent model needs refreshing for this NHL season.
        </p>
      ) : view.isLoading ? (
        <p role="status">Loading NHL players…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full whitespace-nowrap text-sm">
              <caption className="sr-only">
                Conditional playing talent and separate recorded and expected
                contributions
              </caption>
              <thead className="bg-muted">
                <tr>
                  {[
                    "Player",
                    "Pos",
                    "Team",
                    "Last rated season",
                    "Last rated GAR",
                    "Talent GAR/60",
                    "Rated-season TOI",
                    "Expected GAR/82",
                    "Evidence",
                  ].map((h) => (
                    <th scope="col" key={h} className="px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {row.playerName}
                    </th>
                    <td className="px-4 py-3">{row.position}</td>
                    <td className="px-4 py-3">{row.nhlTeam.join(" / ")}</td>
                    <td className="px-4 py-3">
                      {row.last ? season(row.last.year) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {score(row.last?.gar)}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {score(row.forecast?.ratePer60, 3)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.last?.minutes.toFixed(0) ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {score(row.expected?.valuePer82)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {!row.forecast || row.forecast.status === "unavailable"
                        ? "No rated history"
                        : row.forecast.absentSeasons > 0
                          ? "Return uncertain"
                          : row.forecast.staleSeasons > 0
                            ? "Older rated evidence"
                            : row.forecast.status === "research"
                              ? "Limited support"
                              : "Supported"}
                    </td>
                  </tr>
                ))}
                {!view.rows.length && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center">
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
              {view.pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!view.page}
                onClick={() => view.setPage(view.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={view.page + 1 >= view.pages}
                onClick={() => view.setPage(view.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Recorded GAR measures delivered contribution using the hockey model.
        Talent is a rate forecast; expected GAR/82 includes projected
        participation and workload. TOI is recorded minutes in the last rated
        season. Goalies and returning players have limited validation support.
      </p>
    </section>
  );
}

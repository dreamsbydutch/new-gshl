"use client";
import { Button } from "@gshl-ui";
import { useNhlProjectedTalentRankings } from "../../hooks/features/useNhlProjectedTalentRankings";
import type { NhlTalentConfidenceReason } from "../../lib/types/nhl-conditional-talent";

const confidenceReasonLabels: Record<NhlTalentConfidenceReason, string> = {
  "no-rated-history": "No rated history",
  "experimental-trend": "Experimental trend adjustment",
  "limited-position-validation":
    "Historical forecast tests for this position are less reliable; this does not mean player statistics are missing",
  "insufficient-measured-seasons": "Fewer than two rated seasons",
  "insufficient-measured-minutes": "Fewer than 1,000 rated minutes",
  "missing-age-evidence": "Age evidence unavailable",
  "limited-aging-evidence": "Limited aging evidence",
  "absent-season": "Return after a missed season is uncertain",
  "stale-measurement": "Latest rated evidence predates the model cutoff",
  "future-horizon": "Longer forecast horizon has limited support",
};

const deploymentReasonLabels: Record<string, string> = {
  "one-season-role-history": "Goalie role is based on one dressed season",
  "short-dressed-role-sample":
    "Fewer than 20 dressed games for the latest goalie role",
  "stale-role-history": "Goalie role predates the latest completed season",
  "one-season-history": "Deployment is based on one season",
  "short-latest-season": "Recent deployment has a short sample",
  "stale-history": "Deployment evidence is older",
  "age-unavailable": "Age unavailable for deployment forecast",
  "limited-role-validation":
    "Deployment forecast has limited historical validation",
};

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
        <h2 className="text-2xl font-bold">Projected NHL lineup GAR</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Projected GAR estimates total goals contributed above a replacement
          player, including offense, defensive chance prevention and
          goaltending. It uses the same healthy-season lineup scenario as the
          team rankings. Recorded GAR shows what actually happened; missed games
          do not become poor-play observations.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Replacement is the projected playing ability of forward #350,
          defenseman #175 and goalie #55 across current NHL organizations.
          Players below those levels have negative GAR. References use players
          with NHL ability estimates; unmeasured prospects remain unknown.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Preseason {season(view.cutoffYear + 1)} estimate using completed
          seasons through {season(view.cutoffYear)}. Current-season play and
          medical recovery forecasts are not included.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Rank by</span>
          <select
            className="rounded border bg-background px-3 py-2"
            value={view.ordering}
            onChange={(e) => view.changeOrdering(e.target.value)}
          >
            <option value="gar">Projected lineup GAR</option>
            <option value="average">Value above average</option>
          </select>
        </label>
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
      ) : view.organizationError ? (
        <div role="alert">
          <p>{view.organizationError}</p>
          <Button variant="outline" onClick={view.retryOrganizations}>
            Retry rosters
          </Button>
        </div>
      ) : view.isLoading ? (
        <p role="status">Loading NHL players…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full whitespace-nowrap text-sm">
              <caption className="sr-only">
                Players ordered by{" "}
                {view.ordering === "gar"
                  ? "projected total GAR"
                  : "value above average"}
                , with recorded GAR and separate participation-adjusted output
              </caption>
              <thead className="bg-muted">
                <tr>
                  {[
                    "Player",
                    "Pos",
                    "Team",
                    view.ordering === "gar"
                      ? "Projected lineup GAR"
                      : "Value above average",
                    "Last rated season",
                    "Recorded GAR",
                    "Rated-season TOI",
                    "Prior-model season GAR",
                    view.ordering === "gar"
                      ? "Lineup workload"
                      : "Standard workload",
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
                    <td className="px-4 py-3">
                      {row.displayTeams.join(" / ")}
                    </td>
                    <td
                      className="px-4 py-3 font-semibold tabular-nums"
                      title={
                        view.ordering === "gar"
                          ? row.projected?.selected
                            ? `Total GAR in the team lineup scenario. ${row.projected.roleBasis === "projected" ? "Estimated deployment when available" : "Standard role fallback"}; ${row.projected.minutesPerTeamGame.toFixed(1)} minutes per team game. Goalie roles use starts when dressed and the selected tandem's shared ice budget.`
                            : "No selected role in the organization's 14F/8D/2G lineup. An unavailable contribution is not zero."
                          : "Projected goals above the same-position average over a standard role season. This is a separate comparison from GAR."
                      }
                    >
                      {score(
                        view.ordering === "gar"
                          ? row.projected?.gar
                          : row.value?.standardSeasonGoalsAboveAverage,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.last ? season(row.last.year) : "—"}
                    </td>
                    <td
                      className="px-4 py-3 tabular-nums"
                      title="Recorded historical GAR retains its original season-specific replacement reference."
                    >
                      {score(row.last?.gar)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.last?.minutes.toFixed(0) ?? "—"}
                    </td>
                    <td
                      className="px-4 py-3 tabular-nums"
                      title="Participation-adjusted forecast from the prior replacement model; it has not been recalibrated to the 350F/175D/55G reference."
                    >
                      {score(row.expected?.valuePer82)}
                    </td>
                    <td
                      className="px-4 py-3 tabular-nums"
                      title={
                        view.ordering === "gar"
                          ? "Workload in an 82-game healthy-team scenario. Goalie game equivalents are allocated minutes divided by 60, not a prediction of appearances or health."
                          : "Standard position workload used for the above-average comparison, separate from individual lineup deployment."
                      }
                    >
                      {view.ordering === "average"
                        ? row.value?.standardMinutes == null
                          ? "—"
                          : `${row.value.standardMinutes.toFixed(0)} min`
                        : !row.projected?.selected
                          ? "—"
                          : row.position === "G"
                            ? `${((row.projected.minutesPerTeamGame * 82) / 60).toFixed(1)} game equivalents`
                            : `${row.projected.minutesPerTeamGame.toFixed(1)} min/game`}
                    </td>
                    <td
                      className="px-4 py-3 text-muted-foreground"
                      title={[
                        ...(row.evidence?.confidenceReasons.map(
                          (reason) => confidenceReasonLabels[reason],
                        ) ?? []),
                        ...(view.ordering === "gar"
                          ? (row.projected?.deploymentReasons.map(
                              (reason) =>
                                deploymentReasonLabels[reason] ??
                                "Deployment estimate is uncertain",
                            ) ?? [])
                          : []),
                      ].join("; ")}
                    >
                      {view.ordering === "gar" &&
                      row.evidence &&
                      row.evidence.status !== "unavailable" &&
                      !row.projected?.selected
                        ? "No selected lineup role"
                        : !row.evidence || row.evidence.status === "unavailable"
                          ? "No rated history"
                          : view.ordering === "gar" &&
                              row.projected?.roleBasis === "standard-fallback"
                            ? "Standard role fallback"
                            : row.evidence.absentSeasons > 0
                              ? "Return uncertain"
                              : row.evidence.staleSeasons > 0
                                ? "Older rated evidence"
                                : row.evidence.adaptation?.adjustmentPer60
                                  ? "Experimental trend"
                                  : row.evidence.measuredSeasons < 2
                                    ? "One rated season"
                                    : row.evidence.observedMinutes < 1000
                                      ? "Under 1,000 rated minutes"
                                      : row.evidence.status === "research" ||
                                          (view.ordering === "gar" &&
                                            row.projected?.status ===
                                              "research")
                                        ? row.evidence.confidenceReasons.includes(
                                            "limited-position-validation",
                                          )
                                          ? "Forecast uncertainty"
                                          : "Limited forecast evidence"
                                        : "Supported"}
                    </td>
                  </tr>
                ))}
                {!view.rows.length && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center">
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
        {view.ordering === "gar" ? (
          <>
            Projected GAR totals one 82-game team season at full availability,
            sharing a fixed ice-time budget across 14 forwards, 8 defensemen and
            2 goalies. Goalie roles use starts when dressed, adjusted to the
            selected tandem; unused backup appearances describe role, not poor
            play. These are lineup scenarios, not medical forecasts. Unassigned
            roles remain unavailable; missing usage estimates use marked
            standard slot shares. Prior-model season GAR separately includes
            participation and workload risk under its original reference.
          </>
        ) : (
          <>
            Standard role workloads:{" "}
            {view.standardWorkloads
              .map(
                (w) =>
                  `${w.position} ${Math.round(w.standardMinutes).toLocaleString()} minutes`,
              )
              .join(" · ")}
            . These use recent regular-role workloads on an 82-team-game basis,
            with no position quotas or percentile conversion. Value above
            average is a separate baseline from recorded GAR. Prior-model season
            GAR includes projected participation and workload; standard role
            value does not.
          </>
        )}{" "}
        TOI is recorded minutes in the last rated season.
      </p>
    </section>
  );
}

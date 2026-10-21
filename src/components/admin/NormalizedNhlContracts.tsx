"use client";

import { Component, Fragment, type ReactNode } from "react";
import { useNormalizedNhlContracts } from "../../hooks/features/useNormalizedNhlContracts";
import { Button } from "@gshl-ui";

const dollars = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const season = (year: number) => `${year}–${String(year + 1).slice(-2)}`;
const talentScore = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

class ContractRankingBoundary extends Component<
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
          Contract rankings could not load. Check your connection and
          commissioner access.
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

export function NormalizedNhlContracts() {
  return (
    <ContractRankingBoundary>
      <ContractRankings />
    </ContractRankingBoundary>
  );
}

function ContractRankings() {
  const view = useNormalizedNhlContracts();
  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold">NHL contract value and talent</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each season: cap hit ÷ that season’s team salary cap × $100 million.
          Add those values and divide by the contract’s full number of years.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Holistic talent uses goals above replacement per 82 NHL team-game
          opportunities. Zero is replacement level; negative scores remain
          negative. Delivered talent averages completed contract years equally.
          Current-season contribution is shown separately, and unsupported years
          are never filled with zero.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Remaining talent averages age-adjusted annual estimates across every
          remaining contract season. These use completed{" "}
          {season(view.forecastOriginYear - 1)} data; the current-year forecast
          is a full-season estimate, not additional value still to be earned.
          Salary and cap figures do not affect either talent score.
        </p>
        {view.talentError ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            Holistic talent could not load: {view.talentError}
          </p>
        ) : null}
        {view.talentLoading ? (
          <p role="status" className="mt-2 text-sm">
            Loading holistic season histories… {view.talentLoadedSeasons}/
            {view.talentTotalSeasons}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-muted-foreground">
          Calculated live from contract history and your season caps. When
          season records are missing, a consistent contract AAV is carried
          across its term and identified in the breakdown. Contracts needing cap
          figures or term review remain listed below the ranked contracts.
        </p>
      </div>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">
          Season salary caps
        </summary>
        <p className="my-3 text-sm text-muted-foreground">
          Enter the total NHL team salary cap in dollars, not a team’s remaining
          cap space. Your supplied ceiling values include future seasons through
          2041–42. Future figures are your assumptions and can be edited. Saving
          recalculates every contract immediately.
        </p>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Season</th>
                <th className="p-2 text-left">Team salary cap (USD)</th>
              </tr>
            </thead>
            <tbody>
              {view.years.map((year) => (
                <tr key={year} className="border-t">
                  <td className="p-2">{season(year)}</td>
                  <td className="p-2">
                    <input
                      aria-label={`${season(year)} team salary cap in dollars`}
                      inputMode="decimal"
                      className="w-full max-w-xs rounded border bg-white px-3 py-2 text-gray-900"
                      placeholder="Enter season cap"
                      value={
                        view.capDrafts[year] ??
                        (view.caps[year] === undefined
                          ? ""
                          : String(view.caps[year]))
                      }
                      disabled={view.savingCaps}
                      onChange={(event) =>
                        view.changeCap(year, event.target.value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          className="mt-3"
          disabled={view.savingCaps || !Object.keys(view.capDrafts).length}
          onClick={view.saveCaps}
        >
          {view.savingCaps ? "Saving…" : "Save salary caps"}
        </Button>
        {view.capError ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {view.capError}
          </p>
        ) : null}
        {view.capSaved ? (
          <p role="status" className="mt-2 text-sm text-green-700">
            Salary caps saved. Rankings updated.
          </p>
        ) : null}
      </details>

      {view.isLoading ? (
        <p role="status" className="rounded-lg border p-6">
          Loading all contracts before ranking… {view.loaded.toLocaleString()}{" "}
          loaded.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Rank contracts by</span>
              <select
                className="rounded border bg-white px-3 py-2 text-gray-900"
                value={view.sortBy}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === "salary" ||
                    value === "actual" ||
                    value === "forecast"
                  )
                    view.setSortBy(value);
                }}
              >
                <option value="salary">Normalized NHL salary</option>
                <option value="actual">Delivered holistic talent</option>
                <option value="forecast">Remaining holistic talent</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Search player or contract year
              </span>
              <input
                className="w-full rounded border px-3 py-2 sm:w-80"
                value={view.search}
                onChange={(event) => view.setSearch(event.target.value)}
                placeholder="Player name or year"
              />
            </label>
            <p className="text-sm text-muted-foreground">
              {view.total.toLocaleString()} contracts ·{" "}
              {view.rankedCount.toLocaleString()} ranked ·{" "}
              {(view.total - view.rankedCount).toLocaleString()} need data or
              review
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">
                NHL contracts ranked by{" "}
                {view.sortBy === "salary"
                  ? "normalized salary"
                  : view.sortBy === "actual"
                    ? "delivered holistic talent"
                    : "remaining holistic talent"}
                , highest first
              </caption>
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th scope="col" className="p-3">
                    Rank
                  </th>
                  <th scope="col" className="p-3">
                    Player
                  </th>
                  <th scope="col" className="p-3">
                    Seasons
                  </th>
                  <th scope="col" className="p-3">
                    Years
                  </th>
                  <th scope="col" className="p-3 text-right">
                    AAV
                  </th>
                  <th
                    scope="col"
                    aria-sort={
                      view.sortBy === "salary" ? "descending" : undefined
                    }
                    className="p-3 text-right"
                  >
                    Normalized AAV {view.sortBy === "salary" ? "↓" : ""}
                    <br />
                    <span className="font-normal">At a $100M cap</span>
                  </th>
                  <th
                    scope="col"
                    aria-sort={
                      view.sortBy === "actual" ? "descending" : undefined
                    }
                    className="p-3 text-right"
                  >
                    Delivered talent {view.sortBy === "actual" ? "↓" : ""}
                    <br />
                    <span className="font-normal">GAR/82 per year</span>
                  </th>
                  <th
                    scope="col"
                    aria-sort={
                      view.sortBy === "forecast" ? "descending" : undefined
                    }
                    className="p-3 text-right"
                  >
                    Projected talent {view.sortBy === "forecast" ? "↓" : ""}
                    <br />
                    <span className="font-normal">
                      Remaining years · GAR/82
                    </span>
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Avg. cap share
                  </th>
                  <th scope="col" className="p-3">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="border-t align-top">
                      <td className="p-3 tabular-nums">{row.rank ?? "—"}</td>
                      <th scope="row" className="p-3 text-left font-medium">
                        {row.playerName}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.position}
                        </span>
                      </th>
                      <td className="whitespace-nowrap p-3">
                        {season(row.startSeasonStartYear)} to{" "}
                        {season(row.expirySeasonStartYear)}
                      </td>
                      <td className="p-3">{row.length}</td>
                      <td className="p-3 text-right tabular-nums">
                        {dollars(row.nominalAav)}
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums">
                        {dollars(row.normalizedAav)}
                        {row.normalizedAav === null ? (
                          <div className="mt-1 text-xs font-normal text-amber-700">
                            {row.termNeedsReview
                              ? "Term needs review"
                              : row.missingCapYears.length
                                ? `Missing caps: ${row.missingCapYears.map(season).join(", ")}`
                                : "Missing season cap hits"}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums">
                        {talentScore(row.actualTalent)}
                        <div className="text-xs text-muted-foreground">
                          {row.talent?.actual
                            ? `${row.talent.actual.coveredYearCount}/${row.talent.actual.expectedYearCount} completed years covered`
                            : view.talentLoading
                              ? "Loading…"
                              : "Unavailable"}
                        </div>
                      </td>
                      <td className="p-3 text-right font-semibold tabular-nums">
                        {talentScore(row.forecastTalent)}
                        <div className="text-xs text-muted-foreground">
                          {row.talent?.forecast.status === "qualified"
                            ? `${row.talent.forecast.years.length} remaining seasons`
                            : row.talent?.forecast.status === "estimated"
                              ? `${row.talent.forecast.years.length} seasons; includes extrapolation`
                              : row.talent?.forecast.status === "expired"
                                ? "Contract ended"
                                : row.talent?.forecast.status === "stale"
                                  ? "Forecast needs refresh"
                                  : view.talentLoading
                                    ? "Loading…"
                                    : "Insufficient validation or history"}
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {percent(row.averageCapShare)}
                      </td>
                      <td className="p-3">
                        <button
                          className="text-blue-700 underline"
                          aria-expanded={view.expandedId === row.id}
                          aria-controls={`contract-${row.id}`}
                          onClick={() =>
                            view.setExpandedId(
                              view.expandedId === row.id ? null : row.id,
                            )
                          }
                        >
                          {view.expandedId === row.id
                            ? "Hide seasons"
                            : "View seasons"}
                        </button>
                      </td>
                    </tr>
                    {view.expandedId === row.id ? (
                      <tr
                        id={`contract-${row.id}`}
                        className="border-t bg-gray-50"
                      >
                        <td colSpan={10} className="p-4">
                          <p className="mb-2 font-medium">
                            {row.playerName} · signed{" "}
                            {new Date(row.signingDate)
                              .toISOString()
                              .slice(0, 10)}
                          </p>
                          {row.talent ? (
                            <div className="mb-5 space-y-3">
                              <h3 className="font-semibold">
                                Holistic hockey contribution
                              </h3>
                              {row.talent.error ? (
                                <p
                                  role="alert"
                                  className="text-sm text-red-600"
                                >
                                  {row.talent.error}
                                </p>
                              ) : null}
                              {row.talent.actual ? (
                                <>
                                  <p className="text-sm">
                                    Completed-year delivered goals above
                                    replacement:{" "}
                                    {talentScore(
                                      row.talent.actual
                                        .completedDeliveredGoalsAboveReplacement,
                                    )}
                                    . Current-season observed contribution:{" "}
                                    {talentScore(
                                      row.talent.actual.currentSeason
                                        ?.goalsAboveReplacement,
                                    )}
                                    . Future years do not enter the delivered
                                    average.
                                  </p>
                                  <table className="w-full text-sm">
                                    <caption className="sr-only">
                                      Actual annual holistic contribution for{" "}
                                      {row.playerName}
                                    </caption>
                                    <thead>
                                      <tr className="text-left">
                                        <th className="p-2">Season</th>
                                        <th className="p-2">Observed GAR</th>
                                        <th className="p-2">GAR/82</th>
                                        <th className="p-2">Coverage</th>
                                        <th className="p-2">Source date</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.talent.actual.years.map((year) => (
                                        <tr
                                          key={year.seasonStartYear}
                                          className="border-t"
                                        >
                                          <td className="p-2">
                                            {season(year.seasonStartYear)}
                                          </td>
                                          <td className="p-2">
                                            {talentScore(
                                              year.goalsAboveReplacement,
                                            )}
                                          </td>
                                          <td className="p-2">
                                            {talentScore(year.gar82)}
                                          </td>
                                          <td className="p-2">
                                            {year.state === "partial"
                                              ? "Season to date; no annual pace"
                                              : year.state === "covered" &&
                                                  year.qualification ===
                                                    "no-nhl-games"
                                                ? "Verified no NHL games"
                                                : year.state}
                                          </td>
                                          <td className="p-2">
                                            {year.sourceFetchedAt
                                              ? new Date(year.sourceFetchedAt)
                                                  .toISOString()
                                                  .slice(0, 10)
                                              : "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              ) : null}
                              {row.talent.forecast.years.length ? (
                                <p className="text-sm text-muted-foreground">
                                  {row.talent.forecast.years[0]?.prediction
                                    .peerAging &&
                                  row.talent.forecast.years[0].prediction
                                    .peerAgingWeight > 0
                                    ? `Development draws on ${row.talent.forecast.years[0].prediction.peerAging.contributingPeers} comparable NHL careers, matched by age, recent performance and workload.`
                                    : "Development uses broader position trends where comparable careers provide limited forecasting evidence."}
                                </p>
                              ) : null}
                              {row.talent.forecast.years.length ? (
                                <table className="w-full text-sm">
                                  <caption className="mb-2 text-left font-medium">
                                    Remaining-season annual talent estimates
                                  </caption>
                                  <thead>
                                    <tr className="text-left">
                                      <th className="p-2">Season</th>
                                      <th className="p-2">Age</th>
                                      <th className="p-2">Expected GAR/82</th>
                                      <th className="p-2">
                                        Historical 80% residual range
                                      </th>
                                      <th className="p-2">Validation</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.talent.forecast.years.map((year) => (
                                      <tr
                                        key={year.seasonStartYear}
                                        className="border-t"
                                      >
                                        <td className="p-2">
                                          {season(year.seasonStartYear)}
                                        </td>
                                        <td className="p-2">
                                          {year.prediction.targetAge ??
                                            "Unknown"}
                                        </td>
                                        <td className="p-2">
                                          {talentScore(
                                            year.prediction.valuePer82,
                                          )}
                                        </td>
                                        <td className="p-2">
                                          {year.prediction.interval
                                            ? `${talentScore(year.prediction.interval.low)} to ${talentScore(year.prediction.interval.high)}`
                                            : "—"}
                                        </td>
                                        <td className="p-2">
                                          {year.prediction.status ===
                                          "qualified"
                                            ? "Historical support passed"
                                            : year.prediction.status ===
                                                "research"
                                              ? "Extrapolated / limited historical support"
                                              : "Unavailable"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : null}
                              {row.talent.forecast.reasons.length ? (
                                <p className="text-sm text-muted-foreground">
                                  {row.talent.forecast.reasons.join(". ")}
                                </p>
                              ) : null}
                              <p className="text-sm text-muted-foreground">
                                Forecast checks use historical seasons and known
                                outcomes; unsupported played seasons remain
                                unknown. Residual ranges describe those observed
                                historical errors, not guaranteed future
                                coverage. Current partial seasons do not enter
                                delivered averages. Projected averages include
                                every remaining year; distant years extrapolate
                                the individual development curve and NHL
                                participation model.
                              </p>
                            </div>
                          ) : null}
                          <table className="w-full text-sm">
                            <caption className="sr-only">
                              Season calculation for {row.playerName}
                            </caption>
                            <thead>
                              <tr className="text-left">
                                <th className="p-2">Season</th>
                                <th className="p-2">Cap hit / AAV</th>
                                <th className="p-2">Team cap</th>
                                <th className="p-2">Cap share</th>
                                <th className="p-2">At $100M cap</th>
                                <th className="p-2">Salary basis</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.breakdown.map((year) => (
                                <tr
                                  key={year.seasonStartYear}
                                  className="border-t"
                                >
                                  <td className="p-2">
                                    {season(year.seasonStartYear)}
                                  </td>
                                  <td className="p-2">
                                    {dollars(year.capHit)}
                                  </td>
                                  <td className="p-2">
                                    {dollars(year.salaryCap)}
                                  </td>
                                  <td className="p-2">
                                    {percent(year.capShare)}
                                  </td>
                                  <td className="p-2">
                                    {dollars(year.normalizedSalary)}
                                  </td>
                                  <td className="p-2">
                                    {year.usesContractAav
                                      ? "Contract AAV"
                                      : year.capHit === null
                                        ? "Missing"
                                        : "Season record"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mt-3 text-sm">
                            {row.normalizedAav === null
                              ? "A full-contract average is unavailable until every required season has a cap and salary, and the contract term is consistent."
                              : `Sum of normalized seasons ÷ ${row.length} years = ${dollars(row.normalizedAav)} normalized AAV. Rounding is for display only.`}
                          </p>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {!view.rows.length ? (
              <p className="p-6 text-sm">
                {view.total
                  ? "No contracts match your search."
                  : "No NHL contract history has been imported yet."}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <Button
              variant="outline"
              disabled={view.page === 0}
              onClick={() => view.setPage(view.page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {view.page + 1} of {view.pageCount} ·{" "}
              {view.resultCount.toLocaleString()} results
            </span>
            <Button
              variant="outline"
              disabled={view.page + 1 >= view.pageCount}
              onClick={() => view.setPage(view.page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

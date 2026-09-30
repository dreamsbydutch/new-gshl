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
        <h2 className="text-2xl font-bold">NHL contract normalized AAV</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Each season: cap hit ÷ that season’s team salary cap × $100 million.
          Add those values and divide by the contract’s full number of years.
        </p>
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
                All NHL contracts sorted by normalized AAV, highest first
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
                    aria-sort="descending"
                    className="p-3 text-right"
                  >
                    Normalized AAV ↓
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
                        <td colSpan={8} className="p-4">
                          <p className="mb-2 font-medium">
                            {row.playerName} · signed{" "}
                            {new Date(row.signingDate)
                              .toISOString()
                              .slice(0, 10)}
                          </p>
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

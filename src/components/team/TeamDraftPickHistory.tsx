"use client";

import type { TeamDraftPickHistoryProps } from "@gshl-types";
import { useOwnerDraftReport } from "../../hooks/features/useOwnerDraftReport";
import { DraftPickListSkeleton } from "@gshl-skeletons";

const number = (value: number | null | undefined) =>
  value == null ? "-" : value.toFixed(1);
const signed = (value: number | null) =>
  value === null ? "-" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

export function TeamDraftPickHistory({
  currentTeam,
}: TeamDraftPickHistoryProps) {
  const report = useOwnerDraftReport(currentTeam.ownerId);
  if (report.isLoading) return <DraftPickListSkeleton />;
  const { data, season } = report;
  if (!data?.seasons.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No draft history is available for this owner.
      </p>
    );
  const trophies = data.seasons.filter((entry) => entry.winner).length;
  return (
    <section className="space-y-6 py-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          The draft dossier
        </p>
        <h2 className="text-2xl font-bold">
          {currentTeam.ownerFirstName}&apos;s draft history
        </h2>
        <p className="text-sm text-muted-foreground">
          The selections, the value, and the players who stayed. {trophies}{" "}
          Calder {trophies === 1 ? "Trophy" : "Trophies"} across{" "}
          {data.seasons.length} seasons.
        </p>
      </header>
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 font-semibold">Calder through the years</h3>
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          aria-label="Draft seasons"
        >
          {data.seasons.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === data.selectedSeasonId}
              onClick={() => report.selectSeason(entry.id)}
              className={`min-w-28 rounded-lg border p-3 text-left transition-colors ${entry.id === data.selectedSeasonId ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
            >
              <span className="block text-sm font-semibold">{entry.name}</span>
              <span className="mt-2 block text-xl font-bold tabular-nums">
                {number(entry.calderRating)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {entry.winner
                  ? "Calder winner"
                  : entry.calderRank
                    ? `League #${entry.calderRank}`
                    : "Not rated"}
              </span>
              {!entry.complete && (
                <span className="text-xs text-muted-foreground">
                  Provisional
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{season?.name} draft report</h3>
        <span className="text-xs text-muted-foreground">
          {season?.complete
            ? "Final regular-season results"
            : "Provisional - season not complete"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Selections", String(report.selections.length)],
          [
            "Above slot",
            report.graded.length
              ? `${report.hits.length} / ${report.graded.length}`
              : "Not rated",
          ],
          ["Average roster days", number(report.averageDays)],
          [
            "Calder standing",
            season?.calderRank ? `#${season.calderRank}` : "Not rated",
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-4">
          <h4 className="text-sm font-semibold">Drafting habits</h4>
          <p className="mt-2 text-sm">
            {report.positions
              .map(({ position, count }) => `${count} ${position}`)
              .join(" - ")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Position mix for this class. Compare seasons above to spot recurring
            preferences.
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <h4 className="text-sm font-semibold">Best value over slot</h4>
          <p className="mt-2 font-medium">
            {report.best?.name ?? "No above-slot result yet"}
          </p>
          {report.best && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Pick #{report.best.pick} - {signed(report.best.surplus)} rating
            </p>
          )}
        </div>
        <div className="rounded-xl border p-4">
          <h4 className="text-sm font-semibold">Largest shortfall</h4>
          <p className="mt-2 font-medium">
            {report.worst?.name ?? "No below-slot result yet"}
          </p>
          {report.worst && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Pick #{report.worst.pick} - {signed(report.worst.surplus)} rating
            </p>
          )}
        </div>
      </div>
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h3 className="font-semibold">Pick by pick</h3>
          <label className="text-sm">
            Show{" "}
            <select
              className="ml-2 rounded-md border bg-background p-2"
              value={report.filter}
              onChange={(event) => report.setFilter(event.target.value)}
            >
              <option value="all">All picks</option>
              <option value="hits">Above slot</option>
              <option value="misses">Below slot</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Draft outcomes for {season?.name}; ratings and roster days cover
              the regular season.
            </caption>
            <thead className="border-y bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {[
                  "Pick / player",
                  "Slot benchmark",
                  "Overall rating",
                  "Team rating",
                  "Roster days",
                  "Over slot",
                ].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.visiblePicks.map((pick) => (
                <tr key={pick.id} className="border-b last:border-0">
                  <th scope="row" className="min-w-48 px-4 py-3 font-normal">
                    <span className="block font-medium">{pick.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {pick.signing
                        ? "Signing - excluded from grading"
                        : `Round ${pick.round} - #${pick.pick ?? "-"}`}{" "}
                      - {pick.position}
                    </span>
                  </th>
                  <td className="px-4 py-3 tabular-nums">
                    {number(pick.expectedRating)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {number(pick.overallRating)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {number(pick.teamRating)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{pick.days ?? "-"}</td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-semibold tabular-nums ${(pick.surplus ?? 0) > 0 ? "text-emerald-700 dark:text-emerald-400" : (pick.surplus ?? 0) < 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                  >
                    {signed(pick.surplus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.visiblePicks.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No picks match this view.
            </p>
          )}
        </div>
      </div>
      <details className="rounded-xl border p-4 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          How to read draft success
        </summary>
        <div className="mt-3 space-y-2">
          <p>
            Calder is the official best-draft measure. It combines scouting
            value, NHL performance, overall GSHL performance, and production for
            the drafting team. Trophy badges reflect recorded awards.
          </p>
          <p>
            Over slot is a separate retrospective benchmark: overall
            regular-season rating minus the expectation for the pick. The
            expectation spans the lowest to highest rated drafted player in that
            season, using Calder&apos;s draft-slot curve (remaining slot share raised
            to 1.35). It is not an individual Calder score.
          </p>
          <p>
            Team rating shows what the drafting team received. Roster days show
            recorded days with that team. These remain separate so a strong
            player who left early is distinguishable from a player who stayed
            and underperformed.
          </p>
          <p>
            Signings are excluded from grading. Missing ratings or roster
            records display a dash, never an assumed zero. Historical position
            groups are used when available. Owner history follows the
            franchise-to-owner links stored by the league.
          </p>
        </div>
      </details>
    </section>
  );
}

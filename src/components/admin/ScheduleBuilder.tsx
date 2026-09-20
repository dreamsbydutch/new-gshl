"use client";

import { useScheduleBuilderView } from "@gshl-hooks/features/useScheduleBuilderView";

export function ScheduleBuilder() {
  const view = useScheduleBuilderView();
  const inputClass =
    "mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-slate-950";
  const buttonClass =
    "rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-40";
  const names = new Map(view.context?.teams.map((t) => [t.id, t.name]) ?? []);
  const closeRematches = view.balance.filter(
    (p) => p.gap !== null && p.gap < 4,
  ).length;
  return (
    <section
      className="mx-auto max-w-6xl space-y-6"
      aria-labelledby="schedule-builder-heading"
    >
      <div>
        <h2 id="schedule-builder-heading" className="text-2xl font-semibold">
          Schedule builder
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Build a regular season around owner matchup history. Playoffs never
          count toward balance.
        </p>
      </div>
      <div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
        <label className="text-sm">
          Season
          <select
            className={inputClass}
            value={view.seasonId}
            disabled={view.busy}
            onChange={(e) => {
              view.setSeasonId(e.target.value);
              view.setConfirmed(false);
            }}
          >
            <option value="">
              {view.seasons === undefined
                ? "Loading seasons…"
                : "Choose a season"}
            </option>
            {view.seasons?.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Regular-season weeks
          <input
            className={inputClass}
            type="number"
            min={19}
            max={49}
            step={2}
            value={view.weeks}
            disabled={view.busy}
            onChange={(e) => {
              view.setWeeks(Number(e.target.value));
              view.setConfirmed(false);
            }}
          />
        </label>
        <label className="text-sm">
          Random seed
          <input
            className={inputClass}
            type="number"
            min={0}
            max={4294967295}
            step={1}
            value={view.seed}
            disabled={view.busy}
            onChange={(e) => {
              view.setSeed(Number(e.target.value));
              view.setConfirmed(false);
            }}
          />
        </label>
        <p className="text-sm text-slate-600 sm:col-span-3">
          Two conferences of seven require an odd season length of at least 19
          weeks. Each team plays all seven cross-conference opponents once and
          each conference opponent at least twice. Extra conference games favor
          historically underplayed pairs. Change the seed to explore another
          layout. Cross-conference totals increase by one per pair each season,
          so existing differences in those totals cannot be corrected under
          these rules.
        </p>
        <button
          className={buttonClass}
          disabled={!view.context || view.busy}
          onClick={() => void view.generate()}
        >
          {view.busy ? "Working…" : "Generate draft"}
        </button>
      </div>
      {view.loadError && (
        <p
          role="alert"
          className="rounded border border-red-300 p-3 text-red-700"
        >
          {view.loadError}
        </p>
      )}
      {view.seasonId && !view.context && !view.loadError && (
        <p role="status">Loading owner history…</p>
      )}
      {view.context && (
        <p className="text-sm text-slate-600">
          History: regular-season fixtures from {view.context.historySeasons}{" "}
          earlier seasons, grouped by owner through franchise records. Selected
          and future seasons and games marked incomplete are excluded.{" "}
          {view.context.regularWeeks} regular-season weeks currently exist in
          this season.
          {view.context.excluded > 0
            ? ` Warning: ${view.context.excluded} historical games could not be attributed to two distinct owners.`
            : ""}
        </p>
      )}
      {view.error && (
        <p
          role="alert"
          className="rounded border border-red-300 p-3 text-red-700"
        >
          {view.error}
        </p>
      )}
      {view.message && (
        <p
          role="status"
          className="rounded border border-green-300 p-3 text-green-800"
        >
          {view.message}
        </p>
      )}
      {view.games.length > 0 && (
        <>
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="font-semibold">Draft review</h3>
            <p className="my-2 text-sm">
              {view.games.length} games · seven games every week · all matchup
              rules verified. {closeRematches} pairs have rematches fewer than
              four weeks apart.
            </p>
            <p className="mb-4 text-sm text-slate-600">
              Historical home/away balance takes priority over this season’s
              total home games. Large inherited deficits may need multiple
              seasons to correct. Opponent frequency and rematch spacing are
              optimized heuristically; review the report before publishing.
              Drafts are temporary until downloaded or published.
            </p>
            <button className={buttonClass} onClick={view.download}>
              Download CSV
            </button>
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold">
                Publish to season
              </summary>
              <p className="my-3 text-sm">
                Publishing assigns draft week 1 onward to the season’s
                regular-season weeks in week-number order. The season must have
                exactly {view.weeks} future regular-season weeks and no existing
                regular-season matchups. Playoff matchups are preserved.
              </p>
              {view.context?.hasSchedule && (
                <p className="my-2 text-sm text-amber-800">
                  This season already has a schedule. Publishing is unavailable.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={view.confirmed}
                  onChange={(e) => view.setConfirmed(e.target.checked)}
                  disabled={view.busy}
                />
                I reviewed this draft and want to publish it to the selected
                season.
              </label>
              <button
                className={`${buttonClass} mt-3`}
                disabled={
                  !view.confirmed ||
                  view.busy ||
                  Boolean(view.context?.hasSchedule) ||
                  view.context?.regularWeeks !== view.weeks ||
                  Boolean(view.context?.excluded)
                }
                onClick={() => void view.publish()}
              >
                Publish schedule
              </button>
            </details>
          </div>
          <details className="rounded-lg border border-slate-200 p-4">
            <summary className="cursor-pointer font-semibold">
              Owner pair balance report
            </summary>
            <p className="my-3 text-sm">
              Home / away counts are from the first listed team’s owner’s
              perspective. Conference labels reflect the selected season.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Owner pair (current teams)",
                      "Group",
                      "Before H/A",
                      "Added",
                      "After H/A",
                      "Total",
                      "Closest rematch",
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="whitespace-nowrap p-2"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.balance.map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-2">
                        {p.a} / {p.b}
                      </td>
                      <td className="p-2">
                        {p.conference ? "Conference" : "Cross"}
                      </td>
                      <td className="p-2">
                        {p.beforeHome} / {p.beforeAway}
                      </td>
                      <td className="p-2">{p.added}</td>
                      <td className="p-2">
                        {p.afterHome} / {p.afterAway}
                      </td>
                      <td className="p-2">{p.afterHome + p.afterAway}</td>
                      <td className="p-2">
                        {p.gap === null ? "—" : `${p.gap} weeks`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: view.weeks }, (_, i) => (
              <section
                key={i}
                className="rounded-lg border border-slate-200 p-4"
                aria-label={`Week ${i + 1}`}
              >
                <h3 className="mb-3 font-semibold">Week {i + 1}</h3>
                <div className="mb-3 flex gap-3 text-sm">
                  <button
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    aria-label={`Move week ${i + 1} earlier`}
                    disabled={i === 0 || view.busy || view.context?.hasSchedule}
                    onClick={() => view.swapWeeks(i + 1, i)}
                  >
                    Earlier
                  </button>
                  <button
                    className="rounded border px-2 py-1 disabled:opacity-40"
                    aria-label={`Move week ${i + 1} later`}
                    disabled={
                      i === view.weeks - 1 ||
                      view.busy ||
                      view.context?.hasSchedule
                    }
                    onClick={() => view.swapWeeks(i + 1, i + 2)}
                  >
                    Later
                  </button>
                </div>
                <ul className="space-y-2 text-sm">
                  {view.games
                    .filter((g) => g.week === i + 1)
                    .map((g) => (
                      <li key={g.home}>
                        {names.get(g.away)}{" "}
                        <span className="text-slate-500">at</span>{" "}
                        {names.get(g.home)}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

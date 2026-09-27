"use client";

import { useInjuryReport } from "@gshl-hooks/main/useInjuryReport";

export function InjuryReport() {
  const { data, error, loading, refresh } = useInjuryReport();
  const stale = data && Date.now() - data.fetchedAt > 60 * 60 * 1000;
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">NHL injury report</h1>
      <p className="text-sm text-muted-foreground">
        Current designations and updates from ESPN. Return dates are estimates.
        A missing report does not confirm that a player is healthy.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <a
          href="https://www.espn.com/nhl/injuries"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Source: ESPN
        </a>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded border px-3 py-2"
        >
          Refresh
        </button>
      </div>
      {loading && <p role="status">Loading injury updates…</p>}
      {(Boolean(error) || stale) && (
        <p
          role="status"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {error ?? "ESPN updates are delayed."}
          {data
            ? " Showing the last available report."
            : " No report is available yet."}
        </p>
      )}
      {data && (
        <>
          <p className="text-xs text-muted-foreground">
            Feed updated {new Date(data.sourceUpdatedAt).toLocaleString()}. Last
            checked {new Date(data.fetchedAt).toLocaleString()}.
          </p>
          {data.injuries.length === 0 && (
            <p>No injury reports were returned by ESPN.</p>
          )}
          <ul className="space-y-3">
            {data.injuries.map((injury) => (
              <li
                key={injury.id}
                id={`injury-${injury.id}`}
                className="scroll-mt-24 space-y-1 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{injury.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {injury.team}
                    </p>
                  </div>
                  <span
                    className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800"
                    title={injury.status}
                  >
                    {injury.designation}
                  </span>
                </div>
                <p className="text-sm">
                  {injury.status}
                  {injury.description ? ` · ${injury.description}` : ""}
                </p>
                {injury.comment && (
                  <p className="text-sm text-muted-foreground">
                    {injury.comment}
                  </p>
                )}
                {injury.returnDate && (
                  <p className="text-xs">
                    Estimated return: {injury.returnDate}
                  </p>
                )}
                {injury.updatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Updated {new Date(injury.updatedAt).toLocaleString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

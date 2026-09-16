"use client";

import type { TeamHistoryFilterDropdownsProps } from "@gshl-types";

export function FilterDropdowns({
  seasonOptions,
  selectedSeasonIds,
  setSelectedSeasonIds,
  gameTypeValue,
  setGameTypeValue,
  ownerValue,
  setOwnerValue,
  gameTypeOptions,
  ownerOptions,
}: TeamHistoryFilterDropdownsProps) {
  const selectClassName =
    "h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500";

  return (
    <div className="grid w-full grid-cols-2 gap-2">
      <details className="col-span-2 rounded-md border border-slate-300">
        <summary className="min-h-9 cursor-pointer px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
          Years:{" "}
          {selectedSeasonIds.length === seasonOptions.length &&
          seasonOptions.length > 0
            ? "All years"
            : selectedSeasonIds.length === 0
              ? "None selected"
              : seasonOptions
                  .filter((season) => selectedSeasonIds.includes(season.id))
                  .map((season) => season.name)
                  .join(", ")}
        </summary>
        <fieldset className="border-t border-slate-100 px-3 pb-2">
          <legend className="sr-only">
            Years to include in matchup history
          </legend>
          <div className="flex gap-4">
            <button
              type="button"
              className="min-h-9 text-xs font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              onClick={() =>
                setSelectedSeasonIds(seasonOptions.map((season) => season.id))
              }
            >
              All years
            </button>
            <button
              type="button"
              className="min-h-9 text-xs font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              onClick={() =>
                setSelectedSeasonIds(
                  seasonOptions[0] ? [seasonOptions[0].id] : [],
                )
              }
            >
              Latest year
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {seasonOptions.map((season) => (
              <label
                key={season.id}
                className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-slate-950 focus-visible:ring-2 focus-visible:ring-slate-500"
                  checked={selectedSeasonIds.includes(season.id)}
                  onChange={(event) =>
                    setSelectedSeasonIds(
                      event.target.checked
                        ? [...selectedSeasonIds, season.id]
                        : selectedSeasonIds.filter((id) => id !== season.id),
                    )
                  }
                />
                {season.name}
              </label>
            ))}
          </div>
        </fieldset>
      </details>
      <select
        aria-label="Filter history by game type"
        className={selectClassName}
        value={gameTypeValue}
        onChange={(event) => setGameTypeValue(event.target.value)}
      >
        <option value="" disabled>
          Select a Game Type
        </option>
        {gameTypeOptions.map((option) => (
          <option key={option.join("-")} value={option.join(",")}>
            {option[0]}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter history by owner"
        className={selectClassName}
        value={ownerValue}
        onChange={(event) => setOwnerValue(event.target.value)}
      >
        <option value="" disabled>
          Select an Owner
        </option>
        {ownerOptions.map((option) => (
          <option key={option.join("-")} value={option.join(",")}>
            {option[0]}
          </option>
        ))}
      </select>
    </div>
  );
}

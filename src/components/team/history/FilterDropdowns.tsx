"use client";

import type { FilterDropdownsProps } from "@gshl-types";

export function FilterDropdowns({
  seasonValue,
  setSeasonValue,
  gameTypeValue,
  setGameTypeValue,
  ownerValue,
  setOwnerValue,
  seasonOptions,
  gameTypeOptions,
  ownerOptions,
}: FilterDropdownsProps) {
  const selectClassName =
    "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm sm:max-w-56";

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-2 sm:grid-cols-3 sm:justify-items-center">
      <select
        aria-label="Filter history by season"
        className={selectClassName}
        value={seasonValue}
        onChange={(event) => setSeasonValue(event.target.value)}
      >
        <option value="">Select a Season</option>
        {seasonOptions?.map((season) => (
          <option key={season.id} value={[season.name, season.id].join(",")}>
            {season.name}
          </option>
        ))}
      </select>

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

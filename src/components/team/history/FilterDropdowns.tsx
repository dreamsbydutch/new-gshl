"use client";

import type { TeamHistoryFilterDropdownsProps } from "@gshl-types";

export function FilterDropdowns({
  gameTypeValue,
  setGameTypeValue,
  ownerValue,
  setOwnerValue,
  gameTypeOptions,
  ownerOptions,
}: TeamHistoryFilterDropdownsProps) {
  const selectClassName =
    "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm sm:max-w-56";

  return (
    <div className="mx-auto grid w-full max-w-xl gap-2 sm:grid-cols-2 sm:justify-items-center">
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

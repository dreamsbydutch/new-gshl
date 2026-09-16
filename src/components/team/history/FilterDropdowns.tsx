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
    "h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500";

  return (
    <div className="grid w-full grid-cols-2 gap-2">
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

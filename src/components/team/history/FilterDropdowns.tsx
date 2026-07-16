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
  return (
    <div className="mx-20 flex flex-col gap-1">
      <select
        className="border p-2"
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
        className="border p-2"
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
        className="border p-2"
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

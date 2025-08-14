import type { FilterDropdownsProps } from "../utils";

export const FilterDropdowns = ({
  seasonValue,
  setSeasonValue,
  gameTypeValue,
  setGameTypeValue,
  ownerValue,
  setOwnerValue,
  seasonOptions,
  gameTypeOptions,
  ownerOptions,
}: FilterDropdownsProps) => {
  return (
    <div className="mx-20 flex flex-col gap-1">
      {/* Season Dropdown */}
      <select
        className="border p-2"
        value={seasonValue}
        onChange={(e) => setSeasonValue(e.target.value)}
      >
        <option value="">Select a Season</option>
        {seasonOptions?.map((season, index) => (
          <option key={index} value={[season.name, season.id].join(",")}>
            {season.name}
          </option>
        ))}
      </select>

      {/* Game Type Dropdown */}
      <select
        className="border p-2"
        value={gameTypeValue}
        onChange={(e) => setGameTypeValue(e.target.value)}
      >
        <option value="" disabled>
          Select a Game Type
        </option>
        {gameTypeOptions.map((option, index) => (
          <option key={index} value={option.join(",")}>
            {option[0]}
          </option>
        ))}
      </select>

      {/* Owner Dropdown */}
      <select
        className="border p-2"
        value={ownerValue}
        onChange={(e) => {
          setOwnerValue(e.target.value);
        }}
      >
        <option value="" disabled>
          Select an Owner
        </option>
        {ownerOptions.map((option, index) => (
          <option key={index} value={option.join(",")}>
            {option[0]}
          </option>
        ))}
      </select>
    </div>
  );
};

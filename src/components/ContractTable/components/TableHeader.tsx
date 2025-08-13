import { Season } from "@gshl-types";
import { getSeasonDisplay } from "../utils";

interface TableHeaderProps {
  currentSeason: Season;
}

export const TableHeader = ({ currentSeason }: TableHeaderProps) => {
  return (
    <thead>
      <tr>
        <th className="sticky left-0 bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Name
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Pos
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Team
        </th>
        {currentSeason.signingEndDate > new Date() && (
          <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
            {currentSeason.name}
          </th>
        )}
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {getSeasonDisplay(currentSeason.name, 1)}
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {getSeasonDisplay(currentSeason.name, 2)}
        </th>
        <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          {getSeasonDisplay(currentSeason.name, 3)}
        </th>
        {currentSeason.signingEndDate < new Date() && (
          <th className="bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
            {getSeasonDisplay(currentSeason.name, 4)}
          </th>
        )}
      </tr>
    </thead>
  );
};

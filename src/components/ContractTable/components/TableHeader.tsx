/**
 * TableHeader
 * @param currentSeason Active season; determines whether current season column is rendered
 * @returns Table header (<thead>) element
 */
import { getSeasonDisplay } from "../utils";
import type { TableHeaderProps } from "../utils";

export const TableHeader = ({ currentSeason }: TableHeaderProps) => {
  return (
    <thead>
      <tr>
        <th className="sticky left-0 z-30 w-32 bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Name
        </th>
        <th className="sticky left-[8rem] z-30 w-12 bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
          Pos
        </th>
        <th className="sticky left-[11rem] z-30 w-8 bg-gray-800 p-1 text-center text-2xs font-normal text-gray-200">
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

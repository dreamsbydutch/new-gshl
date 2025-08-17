/**
 * CapSpaceRow
 * @param currentTeam Team whose cap space is being displayed
 * @param capSpaceByYear Remaining cap values keyed by season grouping
 * @returns Table row (<tr>) summarizing cap space
 */
import { formatMoney } from "@gshl-utils";
import type { CapSpaceRowProps } from "../utils";

export const CapSpaceRow = ({
  currentTeam,
  capSpaceByYear,
}: CapSpaceRowProps) => {
  return (
    <tr key={`${currentTeam.franchiseId}CapSpace`}>
      <td className="sticky left-0 z-20 w-32 whitespace-nowrap border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs font-bold">
        Cap Space
      </td>
      <td className="sticky left-[8rem] z-20 w-12 whitespace-nowrap border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs"></td>
      <td className="sticky left-[11rem] z-20 w-8 whitespace-nowrap border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs"></td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatMoney(capSpaceByYear.currentYear)}
      </td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatMoney(capSpaceByYear.year2026)}
      </td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatMoney(capSpaceByYear.year2027)}
      </td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatMoney(capSpaceByYear.year2028)}
      </td>
    </tr>
  );
};

import type { Contract, GSHLTeam } from "@gshl-types";
import { formatCurrency } from "@gshl-utils";

interface CapSpaceRowProps {
  contracts: Contract[];
  currentTeam: GSHLTeam;
  capSpaceByYear: {
    currentYear: number;
    year2026: number;
    year2027: number;
    year2028: number;
  };
}

export const CapSpaceRow = ({
  currentTeam,
  capSpaceByYear,
}: CapSpaceRowProps) => {
  return (
    <tr key={`${currentTeam.franchiseId}CapSpace`}>
      <td className="sticky left-0 border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs font-bold">
        Cap Space
      </td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs"></td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs"></td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatCurrency(capSpaceByYear.currentYear)}
      </td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatCurrency(capSpaceByYear.year2026)}
      </td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatCurrency(capSpaceByYear.year2027)}
      </td>
      <td className="border-t border-gray-800 bg-gray-200 px-2 py-1 text-center text-xs">
        {formatCurrency(capSpaceByYear.year2028)}
      </td>
    </tr>
  );
};

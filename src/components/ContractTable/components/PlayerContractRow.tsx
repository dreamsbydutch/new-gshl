/**
 * PlayerContractRow
 * @param contract Contract record to display
 * @param player Player entity (if undefined a skeleton row is shown)
 * @param currentSeason Season object for conditional rendering of current season column
 * @param nhlTeams NHL team metadata list for logo lookup
 * @returns Table row element (<tr>) with contract cells
 */
import { formatMoney } from "@gshl-utils";
import { PlayerContractRowSkeleton } from "@gshl-skeletons";
import Image from "next/image";
import { getExpiryStatusClass } from "@gshl-utils";
import type { PlayerContractRowProps } from "@gshl-utils";

export const PlayerContractRow = ({
  contract,
  player,
  currentSeason,
  nhlTeams,
}: PlayerContractRowProps) => {
  if (!player) return <PlayerContractRowSkeleton contract={contract} />;

  const expiryStatus = String(contract.expiryStatus);
  const playerNhlAbbr = player.nhlTeam?.toString();
  const playerNhlTeam = nhlTeams.find((t) => t.abbreviation === playerNhlAbbr);

  /**
   * Render a salary (cap hit) or expiry status cell for a given future season year.
   * Shows cap hit if the contract extends beyond the cutoff for that season; otherwise
   * if it expires exactly that season (month match), shows the RFA/UFA/other expiry badge.
   */
  const renderCapHitCell = (year: number) => {
    const endYear =
      contract.capHitEndDate instanceof Date
        ? contract.capHitEndDate.getFullYear()
        : 0;
    if (endYear > year) {
      // Contract still active beyond this season's year => show cap hit
      return (
        <td
          key={`yr-${year}`}
          className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs"
        >
          {formatMoney(contract.capHit)}
        </td>
      );
    }
    if (endYear === year) {
      // Expiry occurs this displayed season => show status badge
      return (
        <td
          key={`yr-${year}`}
          className={`mx-2 my-1 rounded-xl border-b border-t border-gray-300 text-center text-2xs font-bold ${getExpiryStatusClass(expiryStatus)}`}
        >
          {expiryStatus === "Buyout" ? "" : expiryStatus}
        </td>
      );
    }
    // Contract ended before this season => empty cell
    return (
      <td
        key={`yr-${year}`}
        className="border-b border-t border-gray-300 px-2 py-1 text-center text-xs"
      />
    );
  };

  return (
    <tr
      className={`${expiryStatus === "Buyout" ? "text-gray-400" : "text-gray-800"}`}
    >
      <td className="sticky left-0 z-20 w-32 max-w-fit whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 p-1 text-center text-xs">
        {player.fullName}
      </td>
      <td className="sticky left-[8rem] z-20 w-12 whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 p-1 text-center text-xs">
        {player.nhlPos.toString()}
      </td>
      <td className="sticky left-[11rem] z-20 w-8 whitespace-nowrap border-b border-t border-gray-300 bg-gray-50 p-1 text-center text-xs">
        {playerNhlTeam?.logoUrl ? (
          <Image
            src={playerNhlTeam.logoUrl}
            alt={playerNhlTeam.fullName || playerNhlAbbr || "NHL Team"}
            className="mx-auto h-4 w-4"
            width={64}
            height={64}
          />
        ) : (
          <span className="text-2xs font-semibold">{playerNhlAbbr || "-"}</span>
        )}
      </td>
      {/* Current season column (only if signing window still open, matching header) */}
      {currentSeason.signingEndDate > new Date() &&
        contract.capHitEndDate instanceof Date &&
        contract.capHitEndDate > new Date() && (
          <td className="border-b border-t border-gray-300 p-1 text-center text-xs">
            {formatMoney(contract.capHit)}
          </td>
        )}
      {/* Future season columns (dynamic) */}
      {(() => {
        // Derive base future year consistent with cap space hook (first season year + 1)
        const firstYear = parseInt(currentSeason.name.slice(0, 4), 10);
        const baseYear = firstYear + 1;
        // Always show next 5 future accounting years now (aligns with header offsets 1..5)
        const futureYears: number[] = [
          baseYear,
          baseYear + 1,
          baseYear + 2,
          baseYear + 3,
        ];
        return futureYears.map((y) => renderCapHitCell(y));
      })()}
    </tr>
  );
};

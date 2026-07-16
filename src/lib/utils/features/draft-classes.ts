import type { Contract } from "@gshl-types";
import { safeParseSheetDate } from "../core";

/**
 * Returns draft class cutoff.
 *
 * @param draftYear - The draft year to use.
 * @param offset - The offset to use.
 * @returns The requested draft class cutoff.
 */
export function getDraftClassCutoff(
  draftYear: number,
  offset: number,
): Date {
  return new Date(draftYear + offset, 3, 19);
}

/**
 * Returns draft class offset.
 *
 * @param selectedType - The selected type to use.
 * @returns The requested draft class offset.
 */
export function getDraftClassOffset(selectedType: string): number {
  if (selectedType === "cyufa") return 0;
  if (selectedType === "nyufa") return 1;
  if (selectedType === "fyufa") return 2;
  return 3;
}

/**
 * Finds expiring draft class contract.
 *
 * @param activeContracts - The active contracts to use.
 * @param playerId - The player id to use.
 * @param previousCutoff - The previous cutoff to use.
 * @param cutoff - The cutoff to use.
 * @returns The matching expiring draft class contract, if one exists.
 */
export function findExpiringDraftClassContract(
  activeContracts: Contract[],
  playerId: string,
  previousCutoff: Date,
  cutoff: Date,
): Contract | undefined {
  return activeContracts
    .filter((contract) => String(contract.playerId) === playerId)
    .filter((contract) => {
      const expiryDate = safeParseSheetDate(contract.expiryDate);

      if (!expiryDate) {
        return false;
      }

      return (
        previousCutoff.getTime() <= expiryDate.getTime() &&
        expiryDate.getTime() < cutoff.getTime()
      );
    })
    .sort((left, right) => {
      const leftExpiry = safeParseSheetDate(left.expiryDate)?.getTime() ?? 0;
      const rightExpiry = safeParseSheetDate(right.expiryDate)?.getTime() ?? 0;
      return rightExpiry - leftExpiry;
    })[0];
}

import type { Contract } from "@gshl-types";
import { safeParseSheetDate } from "../core";

export function getDraftClassCutoff(
  draftYear: number,
  offset: number,
): Date {
  return new Date(draftYear + offset, 3, 19);
}

export function getDraftClassOffset(selectedType: string): number {
  if (selectedType === "cyufa") return 0;
  if (selectedType === "nyufa") return 1;
  if (selectedType === "fyufa") return 2;
  return 3;
}

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

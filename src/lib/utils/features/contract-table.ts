/**
 * Contract Table Utility Functions
 *
 * Contains constants and helper functions for the ContractTable component.
 * Type definitions have been moved to @gshl-types/ui-components
 */

export const CAP_CEILING = 25000000;
export const CAP_SEASON_END_MONTH = 3; // April (0-indexed)
export const CAP_SEASON_END_DAY = 19;

// Re-export types for backward compatibility
export type {
  ContractTableProps,
  PlayerContractRowProps,
  TableHeaderProps,
  CapSpaceRowProps,
} from "@gshl-types";

/**
 * Maps a contract expiry status to Tailwind utility classes for badge styling.
 * @param expiryStatus - Contract expiry status (e.g. "RFA", "UFA", "Buyout")
 * @returns Tailwind class string (empty string if no special styling)
 */
export const getExpiryStatusClass = (expiryStatus: string) => {
  if (expiryStatus === "RFA") {
    return "bg-orange-100 text-orange-700";
  }
  if (expiryStatus === "UFA") {
    return "bg-rose-100 text-rose-800";
  }
  return "";
};

/**
 * Produces a future season display label given a base season name and offset.
 * Assumes the season name begins with the 4-digit starting year (e.g. "2024-25").
 * @param seasonName - Base season name string
 * @param yearOffset - Number of seasons ahead to display (1 => next season)
 * @returns A label like "2025-26"
 */
export const getSeasonDisplay = (seasonName: string, yearOffset: number) => {
  const year = +seasonName.slice(0, 4) + yearOffset;
  return `${year}-${year - 1999}`;
};

/**
 * Validates if a value is a valid Date object
 * @param value - Value to check
 * @returns True if value is a valid Date object
 */
export const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Generates a stable unique key for a contract row
 * @param contract - Contract object
 * @param index - Row index as fallback
 * @returns Stable unique key string
 */
export const getContractRowKey = (
  contract: {
    id?: string;
    playerId?: string;
    capHitEndDate?: Date | string;
    updatedAt?: Date;
    createdAt?: Date;
  },
  index: number,
): string => {
  const segments = [
    `id:${contract.id ?? "missing"}`,
    `player:${contract.playerId ?? "missing"}`,
  ];

  const endToken = isValidDate(contract.capHitEndDate)
    ? `end:${contract.capHitEndDate.getTime()}`
    : `end:${String(contract.capHitEndDate ?? "missing")}`;

  segments.push(endToken);

  if (isValidDate(contract.updatedAt)) {
    segments.push(`updated:${contract.updatedAt.getTime()}`);
  } else if (isValidDate(contract.createdAt)) {
    segments.push(`created:${contract.createdAt.getTime()}`);
  } else {
    segments.push(`idx:${index}`);
  }

  return segments.join("|");
};

/**
 * Contract Table Utility Functions
 *
 * Contains constants and helper functions for the ContractTable component.
 * Type definitions are sourced from @gshl-types
 */

import type { ContractTableProps } from "@gshl-types";
import { toNumber } from "../core";

type DateCandidate = Date | string | number | null | undefined;

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
 * Returns expiry status class.
 *
 * @param expiryStatus - The expiry status to use.
 */
export const getExpiryStatusClass = (expiryStatus: string) => {
  if (expiryStatus === "RFA") {
    return "bg-orange-100 text-orange-700";
  }
  if (expiryStatus === "UFA") {
    return "bg-rose-100 text-rose-800";
  }
  if (expiryStatus === "Trade") {
    return "bg-sky-100 text-sky-800";
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
 * Checks whether valid date.
 *
 * @param value - The source value to process.
 * @returns The resulting valid date.
 */
export const isValidDate = (value: DateCandidate): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Returns display season year.
 *
 * @param currentSeason - The current season to use.
 * @returns The requested display season year.
 */
export function getDisplaySeasonYear(
  currentSeason: ContractTableProps["currentSeason"],
): number {
  const explicitYear = toNumber(currentSeason?.year, Number.NaN);
  if (Number.isFinite(explicitYear)) {
    return explicitYear;
  }

  const match = currentSeason?.name?.match(/^(\d{4})/);
  return match ? Number(match[1]) + 1 : new Date().getFullYear();
}

/**
 * Returns date year.
 *
 * @param value - The source value to process.
 * @returns The requested date year.
 */
export function getDateYear(
  value: Date | string | null | undefined,
): number | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getFullYear();
  }

  const matches = String(value).match(/\d{4}/g);
  if (!matches?.length) return null;
  return Number(matches[matches.length - 1]);
}

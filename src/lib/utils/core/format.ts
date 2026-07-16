// Formatting utility functions
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toNumber } from "./data";

/**
 * Cn.
 *
 * @param inputs - The inputs to use.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats player name for display.
 *
 * @param name - The name to use.
 * @returns The formatted player name.
 */
export function formatPlayerName(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Formats team name for display.
 *
 * @param name - The name to use.
 * @param location - The location to use.
 * @returns The formatted team name.
 */
export function formatTeamName(name: string, location?: string): string {
  if (location) {
    return `${location} ${name}`;
  }
  return name;
}

/**
 * Truncate text.
 *
 * @param text - The text to use.
 * @param maxLength - The max length to use.
 * @returns The resulting truncate text.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Formats stat for display.
 *
 * @param stat - The stat to use.
 * @param decimals - The decimals to use.
 * @returns The formatted stat.
 */
export function formatStat(stat: number | string, decimals = 0): string {
  const value = toNumber(stat, 0);
  return value.toFixed(decimals);
}

/**
 * Formats record for display.
 *
 * @param wins - The wins to use.
 * @param losses - The losses to use.
 * @param ties - The ties to use.
 * @returns The formatted record.
 */
export function formatRecord(wins: number, losses: number, ties = 0): string {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }
  return `${wins}-${losses}`;
}

/**
 * Formats number for display.
 *
 * @param value - The source value to process.
 * @param maxFractionDigits - The max fraction digits to use.
 * @returns The formatted number.
 */
export function formatNumber(
  value: number | string | null | undefined,
  maxFractionDigits = 1,
): string {
  const num = toNumber(value, Number.NaN);
  if (!Number.isFinite(num)) return "-";

  try {
    return Intl.NumberFormat("en-US", {
      maximumFractionDigits: Math.max(0, Math.min(20, maxFractionDigits)),
    }).format(num);
  } catch {
    return String(num);
  }
}

/**
 * Formats compact number for display.
 *
 * @param value - The source value to process.
 * @returns The formatted compact number.
 */
export function formatCompactNumber(
  value: number | string | null | undefined,
): string {
  const num = toNumber(value, 0);

  try {
    return Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(num);
  } catch {
    return formatNumber(num);
  }
}

/**
 * Formats money for display.
 *
 * @param value - The source value to process.
 * @param short - The short to use.
 * @returns The formatted money.
 */
export function formatMoney(
  value: number | string | null | undefined,
  short = false,
): string {
  const num = toNumber(value, Number.NaN);
  if (!Number.isFinite(num) || num === 0) return "-";

  try {
    const absNum = Math.abs(num);
    if (absNum >= 1_000_000)
      return `$${(num / 1_000_000).toFixed(short ? 1 : 3)} M`;
    if (absNum >= 10_000) return `$${(num / 1_000).toFixed(0)} k`;

    return Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: short ? 0 : 2,
      minimumFractionDigits: short ? 0 : 2,
    }).format(num);
  } catch {
    return "-";
  }
}

/**
 * Formats percentage for display.
 *
 * @param value - The source value to process.
 * @param asDecimal - The as decimal to use.
 * @returns The formatted percentage.
 */
export function formatPercentage(
  value: number | string | null | undefined,
  asDecimal = false,
): string {
  const num = toNumber(value, 0);
  const percentage = asDecimal ? num : num / 100;

  try {
    return Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(percentage);
  } catch {
    const fallback = asDecimal ? num * 100 : num;
    return `${fallback.toFixed(1)}%`;
  }
}

/**
 * Formats rank for display.
 *
 * @param value - The source value to process.
 * @returns The formatted rank.
 */
export function formatRank(value: number | string | null | undefined): string {
  const num = Math.trunc(toNumber(value, 0));
  if (num <= 0) return "0th";
  if (num >= 11 && num <= 13) return `${num}th`;

  const lastDigit = num % 10;
  return `${num}${["th", "st", "nd", "rd"][lastDigit] ?? "th"}`;
}

/**
 * Formats time for display.
 *
 * @param value - The source value to process.
 * @returns The formatted time.
 */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "N/A";

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "N/A";

  try {
    return date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  } catch {
    return "N/A";
  }
}

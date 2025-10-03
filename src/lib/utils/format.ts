// Formatting utility functions
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toNumber } from "./data";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPlayerName(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatTeamName(name: string, location?: string): string {
  if (location) {
    return `${location} ${name}`;
  }
  return name;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function formatStat(stat: number | string, decimals = 0): string {
  const value = toNumber(stat, 0);
  return value.toFixed(decimals);
}

export function formatRecord(wins: number, losses: number, ties = 0): string {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }
  return `${wins}-${losses}`;
}

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

export function formatRank(value: number | string | null | undefined): string {
  const num = Math.trunc(toNumber(value, 0));
  if (num <= 0) return "0th";
  if (num >= 11 && num <= 13) return `${num}th`;

  const lastDigit = num % 10;
  return `${num}${["th", "st", "nd", "rd"][lastDigit] ?? "th"}`;
}

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

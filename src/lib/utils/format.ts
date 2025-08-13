// Formatting utility functions
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(num: number | string): string {
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return "0";

  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercentage(num: number | string, decimals = 1): string {
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return "0%";

  return `${n.toFixed(decimals)}%`;
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
  const n = typeof stat === "string" ? parseFloat(stat) : stat;
  if (isNaN(n)) return "0";

  return n.toFixed(decimals);
}

export function formatRecord(wins: number, losses: number, ties = 0): string {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }
  return `${wins}-${losses}`;
}

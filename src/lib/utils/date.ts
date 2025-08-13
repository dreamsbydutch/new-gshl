// Date utility functions

export function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0] ?? ""; // YYYY-MM-DD
}

export function parseSheetDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

export function formatSheetDate(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().split("T")[0] ?? "";
}

export function getCurrentSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Hockey season typically starts in October
  return month >= 9 ? year : year - 1;
}

export function getSeasonString(year: number): string {
  return `${year}-${(year + 1).toString().slice(-2)}`;
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

export function formatDisplayDate(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatTimestamp(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function convertInputDate(excelSerialDate: number): Date {
  // Excel's epoch is January 1, 1900. JavaScript's epoch is January 1, 1970.
  // The difference in days between these two dates is 25569.
  // We also need to account for the leap year bug in Excel's 1900 calculation,
  // where it incorrectly treats 1900 as a leap year, adding an extra day.
  // This adjustment is typically handled by subtracting 1 if the date is after Feb 28, 1900.
  // However, for simplicity and common use cases (dates after 1900),
  // directly using the 25569 offset is often sufficient.

  const daysSince1900 = excelSerialDate - 1; // Subtract 1 because Excel's day 1 is Jan 1, 1900
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const excelEpochToJSEpochOffsetMs = 25569 * millisecondsPerDay;

  // Calculate milliseconds since JS epoch
  const jsMilliseconds =
    daysSince1900 * millisecondsPerDay - excelEpochToJSEpochOffsetMs;

  return new Date(jsMilliseconds);
}

// Date utility functions

function padDatePart(value: number | string): string {
  return String(value).padStart(2, "0");
}

function buildUtcDate(year: number, month: number, day: number): Date | null {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(parsed.getTime())) return null;
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function normalizeDateOnlyValue(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;

  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : toIsoDateOnly(input);
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 1) return null;
    return toIsoDateOnly(convertInputDate(input));
  }

  if (typeof input !== "string") {
    return null;
  }

  const raw = input.trim();
  if (!raw || raw === "null" || raw === "undefined") return null;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${padDatePart(month ?? "")}-${padDatePart(day ?? "")}`;
  }

  const isoDateTimeMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})T/.exec(raw);
  if (isoDateTimeMatch) {
    const [, year, month, day] = isoDateTimeMatch;
    return `${year}-${padDatePart(month ?? "")}-${padDatePart(day ?? "")}`;
  }

  const slashIsoMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if (slashIsoMatch) {
    const [, year, month, day] = slashIsoMatch;
    return `${year}-${padDatePart(month ?? "")}-${padDatePart(day ?? "")}`;
  }

  const mdyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    return `${year}-${padDatePart(month ?? "")}-${padDatePart(day ?? "")}`;
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 1) {
      return toIsoDateOnly(convertInputDate(asNumber));
    }
    return null;
  }

  const parsed = safeParseSheetDate(raw);
  return parsed ? toIsoDateOnly(parsed) : null;
}

export function formatDate(date: Date | string | null): string {
  return normalizeDateOnlyValue(date) ?? "";
}

function formatLocalDateOnlyForDisplay(date: Date | string): string {
  const normalized = normalizeDateOnlyValue(date);
  if (normalized) {
    const [year = 0, month = 1, day = 1] = normalized.split("-").map(Number);
    const localMidday = new Date(year, month - 1, day, 12);
    return localMidday.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  const parsed = safeParseSheetDate(date);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function showDate(date: Date | string | null): string {
  if (!date) return "N/A";
  return formatLocalDateOnlyForDisplay(date) || "N/A";
}

export function parseSheetDate(dateStr: string | null): Date | null {
  return safeParseSheetDate(dateStr);
}

export function formatSheetDate(date: Date | null): string {
  return date ? toIsoDateOnly(date) : "";
}

export function getCurrentSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Hockey season typically starts in October
  return month >= 9 ? year + 1 : year;
}

export function getSeasonString(year: number): string {
  return `${year}-${(year + 1).toString().slice(-2)}`;
}

export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

export function formatDisplayDate(date: Date | string | null): string {
  if (!date) return "";
  return formatLocalDateOnlyForDisplay(date);
}

export function formatTimestamp(date: Date | string | null): string {
  if (!date) return "";
  const d = safeParseSheetDate(date);
  if (!d) return "";
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
  // Google Sheets and Excel serial dates are day counts relative to 1899-12-30.
  // Using the standard 25569 offset preserves the expected date-only value.
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const excelEpochToJSEpochOffsetMs = 25569 * millisecondsPerDay;

  // Calculate milliseconds since JS epoch
  const jsMilliseconds =
    excelSerialDate * millisecondsPerDay - excelEpochToJSEpochOffsetMs;

  return new Date(jsMilliseconds);
}

/**
 * Safely converts date input from Google Sheets to a Date object
 * Handles both string and number inputs from Google Sheets
 * @param input - Date input that could be a string, number, or Date
 * @returns Date object or null if invalid
 */
export function safeParseSheetDate(input: unknown): Date | null {
  if (!input) return null;

  // If it's already a Date object, return it
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }

  // If it's a string, try multiple parsing approaches
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;

    // First try as Excel serial number string
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      const asNumber = Number(raw);
      if (!isNaN(asNumber) && asNumber > 1) {
        return convertInputDate(asNumber);
      }
    }

    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return buildUtcDate(Number(year), Number(month), Number(day));
    }

    const slashIsoMatch = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw);
    if (slashIsoMatch) {
      const [, year, month, day] = slashIsoMatch;
      return buildUtcDate(Number(year), Number(month), Number(day));
    }

    const mdyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
    if (mdyMatch) {
      const [, month, day, year] = mdyMatch;
      return buildUtcDate(Number(year), Number(month), Number(day));
    }

    const isoDateTimeMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})T/.exec(raw);
    if (isoDateTimeMatch) {
      const [, year, month, day] = isoDateTimeMatch;
      return buildUtcDate(Number(year), Number(month), Number(day));
    }

    // Try as regular date string
    const asDate = new Date(raw);
    if (!isNaN(asDate.getTime())) {
      return asDate;
    }

    return null;
  }

  // If it's a number, treat as Excel serial date
  if (typeof input === "number" && !isNaN(input) && input > 1) {
    return convertInputDate(input);
  }

  return null;
}

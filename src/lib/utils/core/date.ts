// Date utility functions

/**
 * Pad date part.
 *
 * @param value - The source value to process.
 * @returns The resulting pad date part.
 */
function padDatePart(value: number | string): string {
  return String(value).padStart(2, "0");
}

/**
 * Builds utc date.
 *
 * @param year - The year to use.
 * @param month - The month to use.
 * @param day - The day to use.
 * @returns The assembled utc date.
 */
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

/**
 * Converts input into iso date only.
 *
 * @param date - The date value to process.
 * @returns The converted iso date only.
 */
export function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Converts input into local iso date only.
 *
 * @param date - The date value to process.
 * @returns The converted local iso date only.
 */
export function toLocalIsoDateOnly(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type DateValueOutput = "date" | "iso";
type DateFormatMode = "iso" | "display" | "timestamp";
type DateInput = Date | string | number | boolean | object | null | undefined;

type ResolveDateValueOptions = {
  output?: DateValueOutput;
};

type FormatDateValueOptions = {
  fallback?: string;
  mode?: DateFormatMode;
};

/**
 * Formats resolved date output for display.
 *
 * @param date - The date value to process.
 * @param output - The output to use.
 * @returns The formatted resolved date output.
 */
function formatResolvedDateOutput(
  date: Date,
  output: DateValueOutput,
): Date | string {
  return output === "iso" ? toIsoDateOnly(date) : date;
}

/**
 * Normalizes structured date string.
 *
 * @param raw - The raw to use.
 * @returns The normalized structured date string.
 */
function normalizeStructuredDateString(raw: string): string | null {
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

  return null;
}

/**
 * Converts input into date from normalized iso.
 *
 * @param value - The source value to process.
 * @returns The converted date from normalized iso.
 */
function toDateFromNormalizedIso(value: string): Date | null {
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  return buildUtcDate(year, month, day);
}

/**
 * Resolves date value.
 *
 * @param input - The input value to process.
 * @param options - Configuration options for the operation.
 * @returns The resolved date value.
 */
function resolveDateValue(
  input: DateInput,
  options: ResolveDateValueOptions = {},
): Date | string | null {
  const output = options.output ?? "date";

  if (input === null || input === undefined || input === "") return null;

  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : formatResolvedDateOutput(input, output);
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 1) return null;
    return formatResolvedDateOutput(convertInputDate(input), output);
  }

  if (typeof input !== "string") {
    return null;
  }

  const raw = input.trim();
  if (!raw || raw === "null" || raw === "undefined") return null;

  const normalized = normalizeStructuredDateString(raw);
  if (normalized) {
    return output === "iso"
      ? normalized
      : toDateFromNormalizedIso(normalized);
  }

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 1) {
      return formatResolvedDateOutput(convertInputDate(asNumber), output);
    }
    return null;
  }

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return formatResolvedDateOutput(parsed, output);
}

/**
 * Formats local date only for display for display.
 *
 * @param value - The source value to process.
 * @returns The formatted local date only for display.
 */
function formatLocalDateOnlyForDisplay(value: DateInput): string {
  const normalized = resolveDateValue(value, { output: "iso" });
  if (typeof normalized !== "string") {
    return "";
  }

  const [year = 0, month = 1, day = 1] = normalized.split("-").map(Number);
  const localMidday = new Date(year, month - 1, day, 12);
  return localMidday.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats date value for display.
 *
 * @param value - The source value to process.
 * @param options - Configuration options for the operation.
 * @returns The formatted date value.
 */
function formatDateValue(
  value: DateInput,
  options: FormatDateValueOptions = {},
): string {
  const { fallback = "", mode = "display" } = options;

  if (mode === "iso") {
    const normalized = resolveDateValue(value, { output: "iso" });
    return typeof normalized === "string" ? normalized : fallback;
  }

  if (mode === "display") {
    return formatLocalDateOnlyForDisplay(value) || fallback;
  }

  const parsed = resolveDateValue(value, { output: "date" });
  if (!(parsed instanceof Date)) {
    return fallback;
  }

  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Checks whether iso date in range.
 *
 * @param target - The target to use.
 * @param start - The start to use.
 * @param end - The end to use.
 * @returns True when iso date in range; otherwise false.
 */
export function isIsoDateInRange(
  target: string,
  start: string,
  end: string,
): boolean {
  return start <= target && target <= end;
}

/**
 * Normalizes date only value.
 *
 * @param input - The input value to process.
 * @returns The normalized date only value.
 */
export function normalizeDateOnlyValue(input: DateInput): string | null {
  const normalized = resolveDateValue(input, { output: "iso" });
  return typeof normalized === "string" ? normalized : null;
}

/**
 * Formats date for display.
 *
 * @param date - The date value to process.
 * @returns The formatted date.
 */
export function formatDate(date: Date | string | null): string {
  return formatDateValue(date, { mode: "iso" });
}

/**
 * Show date.
 *
 * @param date - The date value to process.
 * @returns The resulting show date.
 */
export function showDate(date: Date | string | null): string {
  return formatDateValue(date, { mode: "display", fallback: "N/A" });
}

/**
 * Parses sheet date.
 *
 * @param dateStr - The date str to use.
 * @returns The parsed sheet date.
 */
export function parseSheetDate(dateStr: string | null): Date | null {
  return safeParseSheetDate(dateStr);
}

/**
 * Formats sheet date for display.
 *
 * @param date - The date value to process.
 * @returns The formatted sheet date.
 */
export function formatSheetDate(date: Date | null): string {
  return date ? toIsoDateOnly(date) : "";
}

/**
 * Returns current season.
 *
 * @returns The requested current season.
 */
export function getCurrentSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Hockey season typically starts in October
  return month >= 9 ? year + 1 : year;
}

/**
 * Returns season string.
 *
 * @param year - The year to use.
 * @returns The requested season string.
 */
export function getSeasonString(year: number): string {
  return `${year}-${(year + 1).toString().slice(-2)}`;
}

/**
 * Checks whether date in range.
 *
 * @param date - The date value to process.
 * @param start - The start to use.
 * @param end - The end to use.
 * @returns True when date in range; otherwise false.
 */
export function isDateInRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

/**
 * Formats display date for display.
 *
 * @param date - The date value to process.
 * @returns The formatted display date.
 */
export function formatDisplayDate(date: Date | string | null): string {
  return formatDateValue(date, { mode: "display" });
}

/**
 * Formats timestamp for display.
 *
 * @param date - The date value to process.
 * @returns The formatted timestamp.
 */
export function formatTimestamp(date: Date | string | null): string {
  return formatDateValue(date, { mode: "timestamp" });
}

/**
 * Convert input date.
 *
 * @param excelSerialDate - The excel serial date to use.
 * @returns The resulting convert input date.
 */
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
 * Safe parse sheet date.
 *
 * @param input - The input value to process.
 * @returns The resulting safe parse sheet date.
 */
export function safeParseSheetDate(input: DateInput): Date | null {
  const parsed = resolveDateValue(input, { output: "date" });
  return parsed instanceof Date ? parsed : null;
}

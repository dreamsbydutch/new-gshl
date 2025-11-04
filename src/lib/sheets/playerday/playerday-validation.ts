/**
 * PlayerDay Validation Rules
 * ===========================
 * Controls when PlayerDay records can be created or updated to ensure data integrity.
 *
 * Rules:
 * - CREATE: Can create any PlayerDay record that doesn't exist yet
 * - UPDATE: Can only update records within a 2-day window (2 days before or after)
 * - REJECT: Cannot update records older than 2 days
 */

/**
 * Validate if a PlayerDay record can be updated based on its game date
 */
export function canUpdatePlayerDay(
  gameDateStr: string,
  now: Date = new Date(),
): { allowed: boolean; reason?: string } {
  const gameDate = new Date(gameDateStr);

  // Validate date format
  if (isNaN(gameDate.getTime())) {
    return {
      allowed: false,
      reason: `Invalid game date format: ${gameDateStr}. Expected YYYY-MM-DD.`,
    };
  }

  // Get current date at midnight (ignore time component)
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Get game date at midnight
  const gameDateMidnight = new Date(gameDate);
  gameDateMidnight.setHours(0, 0, 0, 0);

  // Calculate difference in days
  const diffMs = today.getTime() - gameDateMidnight.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Allow updates for:
  // - Same day (diffDays === 0)
  // - Up to 2 days in the future (diffDays === -1 or -2)
  // - Up to 2 days in the past (diffDays === 1 or 2)
  if (diffDays >= -2 && diffDays <= 2) {
    return { allowed: true };
  }

  // Reject updates for older dates
  if (diffDays > 2) {
    return {
      allowed: false,
      reason: `Cannot update PlayerDay for ${gameDateStr}. Updates only allowed within a 2-day window. Current date: ${today.toISOString().split("T")[0]}, difference: ${diffDays} days.`,
    };
  }

  // Reject updates for future dates beyond 2 days
  return {
    allowed: false,
    reason: `Cannot update PlayerDay for future date ${gameDateStr}. Game date is ${Math.abs(diffDays)} days in the future (max 2 days allowed).`,
  };
}

/**
 * Validate a batch of PlayerDay updates
 */
export function validatePlayerDayBatch(
  records: Array<{ date: string; id?: string }>,
  now: Date = new Date(),
): {
  valid: Array<{ date: string; id?: string }>;
  invalid: Array<{ date: string; id?: string; reason: string }>;
} {
  const valid: Array<{ date: string; id?: string }> = [];
  const invalid: Array<{ date: string; id?: string; reason: string }> = [];

  for (const record of records) {
    const validation = canUpdatePlayerDay(record.date, now);

    if (validation.allowed) {
      valid.push(record);
    } else {
      invalid.push({
        ...record,
        reason: validation.reason ?? "Unknown validation error",
      });
    }
  }

  return { valid, invalid };
}

/**
 * Check if a PlayerDay record exists based on unique identifiers
 */
export function buildPlayerDayKey(
  playerId: string,
  seasonId: string,
  date: string,
): string {
  return `${seasonId}:${playerId}:${date}`;
}

/**
 * Determine if operation should be CREATE or UPDATE
 */
export function determinePlayerDayOperation(
  record: {
    id?: string;
    playerId: string;
    seasonId: string;
    date: string;
  },
  existingRecords: Set<string>,
): "create" | "update" {
  // If record has an ID and it exists in our set, it's an update
  if (record.id && existingRecords.has(record.id)) {
    return "update";
  }

  // Check by composite key (seasonId:playerId:date)
  const key = buildPlayerDayKey(record.playerId, record.seasonId, record.date);
  if (existingRecords.has(key)) {
    return "update";
  }

  // Otherwise it's a new record
  return "create";
}

/**
 * Filter and categorize PlayerDay records for upsert operations
 */
export function categorizePlayerDayRecords(
  records: Array<{
    id?: string;
    playerId: string;
    seasonId: string;
    date: string;
    [key: string]: unknown;
  }>,
  existingKeys: Set<string>,
  now: Date = new Date(),
): {
  toCreate: Array<{
    id?: string;
    playerId: string;
    seasonId: string;
    date: string;
    [key: string]: unknown;
  }>;
  toUpdate: Array<{
    id?: string;
    playerId: string;
    seasonId: string;
    date: string;
    [key: string]: unknown;
  }>;
  rejected: Array<{
    record: {
      id?: string;
      playerId: string;
      seasonId: string;
      date: string;
      [key: string]: unknown;
    };
    reason: string;
  }>;
} {
  const toCreate: typeof records = [];
  const toUpdate: typeof records = [];
  const rejected: Array<{ record: (typeof records)[0]; reason: string }> = [];

  for (const record of records) {
    const operation = determinePlayerDayOperation(record, existingKeys);

    if (operation === "create") {
      // New records can always be created (no date restrictions)
      toCreate.push(record);
    } else {
      // Existing records must pass date validation
      const validation = canUpdatePlayerDay(record.date, now);

      if (validation.allowed) {
        toUpdate.push(record);
      } else {
        rejected.push({
          record,
          reason: validation.reason ?? "Update not allowed for this date",
        });
      }
    }
  }

  return { toCreate, toUpdate, rejected };
}

/**
 * Format validation error message for logging
 */
export function formatValidationError(
  record: { playerId?: string; date: string; [key: string]: unknown },
  reason: string,
): string {
  return `PlayerDay validation failed for player ${record.playerId ?? "unknown"} on ${record.date}: ${reason}`;
}

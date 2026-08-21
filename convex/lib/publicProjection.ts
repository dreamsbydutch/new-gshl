export const PLAYER_NHL_DISPLAY_FIELDS = [
  "playerId",
  "seasonId",
  "GP",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "GAA",
  "SV",
  "SA",
  "SVP",
  "SO",
  "QS",
  "RBS",
] as const;

/** Returns only the named, defined fields for a browser-facing DTO. */
export function pickDefinedFields(
  row: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    fields.flatMap((field) =>
      row[field] === undefined ? [] : [[field, row[field]]],
    ),
  );
}

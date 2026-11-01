import type { Season } from "@gshl-types";
import { normalizeDateOnlyValue } from "../core/date";

/** The season ends with the Cup final; signing includes the full deadline day. */
export function isRosterSigningWindowOpen(
  season: Pick<Season, "endDate" | "signingEndDate"> | undefined,
  now = Date.now(),
): boolean {
  const finalDay = normalizeDateOnlyValue(season?.endDate);
  const deadline = normalizeDateOnlyValue(season?.signingEndDate);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  return Boolean(finalDay && deadline && today > finalDay && today <= deadline);
}

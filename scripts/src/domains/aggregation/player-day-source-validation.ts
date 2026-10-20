import type { DatabaseRecord } from "../../integrations/data/records";
import { OFFICIAL_GOALIE_ACCOUNTING_EXCEPTIONS } from "./official-goalie-accounting-exceptions";

// These are division/captain opponents in the GSHL history, not NHL clubs.
// ATL ceased to be an NHL club before the first GSHL season.
const EXHIBITION_OPPONENTS = new Set([
  "ATL",
  "CEN",
  "MET",
  "PAC",
  "FOL",
  "TOE",
]);

function matchesReviewedOfficialCounts(
  row: DatabaseRecord,
  opponent: string,
): boolean {
  const clubs = Array.isArray(row.nhlTeam)
    ? row.nhlTeam
    : typeof row.nhlTeam === "string"
      ? row.nhlTeam.split(",")
      : [];
  if (clubs.length !== 1 || typeof clubs[0] !== "string") return false;
  const team = clubs[0].trim().toUpperCase();
  return OFFICIAL_GOALIE_ACCOUNTING_EXCEPTIONS.some(
    (entry) =>
      row.date === entry.date &&
      team === entry.team &&
      opponent === entry.opponent &&
      (row.nhlPlayerId === undefined ||
        Number(row.nhlPlayerId) === entry.nhlPlayerId) &&
      Object.entries(entry.tuple).every(
        ([field, value]) =>
          (typeof row[field] === "number" ||
            (typeof row[field] === "string" && row[field].trim() !== "")) &&
          Number(row[field]) === value,
      ),
  );
}

export function assertLeagueGameSourceDays(
  rows: readonly DatabaseRecord[],
): void {
  const issues: string[] = [];
  for (const row of rows) {
    if (!(Number(row.GP) > 0)) continue;
    const label = `${row._id ?? row.id ?? row.playerId}/${String(row.date)}`;
    const opponent = String(row.opp ?? "")
      .trim()
      .replace(/^(?:@|vs\.?)\s*/i, "")
      .toUpperCase();
    if (
      Number(row.GP) > 1 ||
      (EXHIBITION_OPPONENTS.has(opponent) &&
        String(row.date).slice(0, 4) >= "2013")
    )
      issues.push(
        `${label}: non-league or multiple-game appearance (${opponent})`,
      );
    if (
      row.posGroup === "G" &&
      [row.GA, row.SV, row.SA].every(
        (v) => v !== null && v !== undefined && v !== "",
      )
    ) {
      if (
        Number(row.GA) + Number(row.SV) !== Number(row.SA) &&
        !matchesReviewedOfficialCounts(row, opponent)
      )
        issues.push(`${label}: goalie SV + GA does not equal SA`);
    }
  }
  if (issues.length)
    throw Error(
      `Unvalidated player-day game inputs (${issues.length} issues). Resolve source eligibility/counting conflicts before rebuilding: ${issues.slice(0, 5).join("; ")}`,
    );
}

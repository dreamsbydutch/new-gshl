import type { DatabaseRecord } from "../../integrations/data/records";

export type AllStarDateEvidence = {
  date: string;
  games: { id: number; gameType: number }[];
};
const GAME_FIELDS = [
  "GP",
  "GS",
  "MG",
  "IR",
  "IRplus",
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
  "TOI",
  "MS",
  "BS",
  "opp",
  "score",
] as const;
const EXHIBITION_TEAMS = new Set(["ATL", "CEN", "MET", "PAC", "FOL", "TOE"]);
const present = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

/** Remove game contributions on a proven exhibition-only date, retaining roster identity. */
export function buildAllStarDayPatch(
  row: DatabaseRecord,
  evidence: AllStarDateEvidence,
  leagueTeam?: readonly string[],
): DatabaseRecord {
  if (
    row.date !== evidence.date ||
    !evidence.games.some((g) => g.gameType === 4) ||
    evidence.games.some((g) => g.gameType === 2 || g.gameType === 3)
  )
    throw Error("Official All-Star-only date evidence required");
  const patch: DatabaseRecord = {};
  for (const field of GAME_FIELDS) if (present(row[field])) patch[field] = null;
  if (present(row.Rating) && Number(row.Rating) !== 0) patch.Rating = 0;
  const teams = Array.isArray(row.nhlTeam) ? row.nhlTeam.map(String) : [];
  if (teams.some((team) => EXHIBITION_TEAMS.has(team.toUpperCase()))) {
    if (leagueTeam?.some((team) => EXHIBITION_TEAMS.has(team.toUpperCase())))
      throw Error("Exhibition team cannot be restored as an NHL club");
    patch.nhlTeam = leagueTeam
      ? [...leagueTeam]
      : teams.filter((team) => !EXHIBITION_TEAMS.has(team.toUpperCase()));
  }
  return patch;
}

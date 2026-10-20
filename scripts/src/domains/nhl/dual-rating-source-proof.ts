import type { DualRatingRow } from "../../integrations/nhl/dual-ratings";

type OfficialRow = Record<string, string | number | null>;
export type OfficialRatingSource = {
  nhl: {
    goalies: OfficialRow[];
    skaters: { summary: OfficialRow[]; timeonice: OfficialRow[] };
  };
};
/** Verify every known shared field. Missing fields remain unknown, never zero. */
export function verifyDualRatingSourceFingerprint(
  stat: DualRatingRow,
  nhlPlayerId: number,
  input: OfficialRatingSource,
  teamConflictReason?: string,
  missingFields: string[] = [],
) {
  const goalie = stat.posGroup === "G";
  const fields = goalie
    ? {
        GP: "gamesPlayed",
        W: "wins",
        GA: "goalsAgainst",
        SV: "saves",
        SA: "shotsAgainst",
        SO: "shutouts",
      }
    : {
        GP: "gamesPlayed",
        G: "goals",
        A: "assists",
        P: "points",
        PM: "plusMinus",
        PIM: "penaltyMinutes",
        PPP: "ppPoints",
        SOG: "shots",
      };
  const absent = Object.keys(fields).filter(
    (key) =>
      stat[key] === null ||
      stat[key] === undefined ||
      String(stat[key]).trim() === "",
  );
  if (
    new Set(missingFields).size !== missingFields.length ||
    [...absent].sort().join(",") !== [...missingFields].sort().join(",")
  )
    throw Error("Missing fingerprint fields require exact explicit disclosure");
  const known = Object.entries(fields).filter(
    ([key]) => !missingFields.includes(key),
  );
  const required = goalie
    ? ["GP", "GA", "SV", "SA"]
    : ["GP", "G", "A", "P", "SOG"];
  if (
    known.length < (goalie ? 5 : 6) ||
    required.some((key) => missingFields.includes(key))
  )
    throw Error("Insufficient known official-stat identity evidence");
  const toi = new Map(
    input.nhl.skaters.timeonice.map((row) => [
      Number(row.playerId),
      row.timeOnIce,
    ]),
  );
  const matches = (row: OfficialRow) => {
    if (
      !known.every(
        ([stored, official]) =>
          stat[stored] !== null &&
          stat[stored] !== undefined &&
          stat[stored] !== "" &&
          Number.isFinite(Number(stat[stored])) &&
          typeof row[official] === "number" &&
          Number(stat[stored]) === row[official],
      )
    )
      return false;
    const seconds = goalie ? row.timeOnIce : toi.get(Number(row.playerId));
    return (
      typeof seconds === "number" &&
      Number(stat.TOI) === Math.round((seconds / 60) * 100) / 100
    );
  };
  const candidates = (
    goalie ? input.nhl.goalies : input.nhl.skaters.summary
  ).filter(matches);
  if (
    candidates.length !== 1 ||
    Number(candidates[0]!.playerId) !== nhlPlayerId
  )
    throw Error(
      "Reviewed NHL identity lacks a unique complete official-stat fingerprint",
    );
  const source = candidates[0]!;
  const storedTeams = (
    Array.isArray(stat.nhlTeam) ? stat.nhlTeam : [stat.nhlTeam]
  )
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const officialTeams = String(source.teamAbbrevs ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase());
  if (
    (!storedTeams.length ||
      storedTeams.some((team) => !officialTeams.includes(team))) &&
    !teamConflictReason?.trim()
  )
    throw Error("Reviewed NHL identity team evidence differs");
  return source;
}

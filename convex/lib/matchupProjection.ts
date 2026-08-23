type StatValue = string | number | null | undefined;

type MatchupSource = {
  [key: string]: unknown;
  _id: string;
  seasonId: string;
  weekId: string;
  homeTeamId: string;
  awayTeamId: string;
  gameType: string;
  homeScore?: number | null;
  awayScore?: number | null;
  homeWin?: boolean | null;
  awayWin?: boolean | null;
  tie?: boolean | null;
  isComplete?: boolean | null;
};

type TeamSource = {
  [key: string]: unknown;
  _id: string;
};

type FranchiseSource = {
  [key: string]: unknown;
  name: string;
  abbr: string;
  logoUrl?: string | null;
};

type ConferenceSource = {
  [key: string]: unknown;
  abbr: string;
};

type OwnerSource = {
  [key: string]: unknown;
  nickName?: string | null;
};

type TeamWeekSource = {
  [key: string]: unknown;
  G?: StatValue;
  A?: StatValue;
  P?: StatValue;
  PM?: StatValue;
  PIM?: StatValue;
  PPP?: StatValue;
  SOG?: StatValue;
  HIT?: StatValue;
  BLK?: StatValue;
  W?: StatValue;
  GA?: StatValue;
  GAA?: StatValue;
  SV?: StatValue;
  SA?: StatValue;
  SVP?: StatValue;
  SO?: StatValue;
};

type PlayerWeekSource = TeamWeekSource & {
  _id: string;
  gshlTeamId: string;
  nhlPos?: string[] | null;
  posGroup: string;
  nhlTeam?: string[] | null;
  days?: StatValue;
  GP?: StatValue;
  GS?: StatValue;
  Rating?: StatValue;
};

type PlayerSource = {
  [key: string]: unknown;
  _id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  nhlPos?: string[] | null;
  posGroup: string;
  nhlTeam?: string[] | null;
};

type NhlTeamSource = {
  [key: string]: unknown;
  _id: string;
  name: string;
  abbr: string;
  logoUrl: string;
};

const PLAYOFF_GAME_TYPES = new Set(["QF", "SF", "F"]);

function projectOutcome(matchup: MatchupSource) {
  if (
    !PLAYOFF_GAME_TYPES.has(matchup.gameType) ||
    (!matchup.isComplete && matchup.tie !== true)
  ) {
    return {
      homeWin: matchup.homeWin ?? null,
      awayWin: matchup.awayWin ?? null,
      tie: matchup.tie ?? null,
    };
  }

  if (matchup.homeScore != null && matchup.awayScore != null) {
    return {
      homeWin: matchup.homeScore >= matchup.awayScore,
      awayWin: matchup.awayScore > matchup.homeScore,
      tie: false,
    };
  }

  if (matchup.tie === true) {
    return { homeWin: true, awayWin: false, tie: false };
  }

  return {
    homeWin: matchup.homeWin ?? null,
    awayWin: matchup.awayWin ?? null,
    tie: matchup.tie ?? null,
  };
}

/** Projects the selected matchup and preserves the playoff tiebreak outcome. */
export function projectMatchupDetailsMatchup(matchup: MatchupSource) {
  const outcome = projectOutcome(matchup);
  return {
    id: matchup._id,
    seasonId: matchup.seasonId,
    weekId: matchup.weekId,
    homeTeamId: matchup.homeTeamId,
    awayTeamId: matchup.awayTeamId,
    gameType: matchup.gameType,
    homeScore: matchup.homeScore ?? null,
    awayScore: matchup.awayScore ?? null,
    homeWin: outcome.homeWin,
    awayWin: outcome.awayWin,
    tie: outcome.tie,
    isComplete: matchup.isComplete ?? false,
  };
}

/** Projects public team branding without owner contact or financial fields. */
export function projectMatchupDetailsTeam(
  team: TeamSource,
  franchise: FranchiseSource | null,
  conference: ConferenceSource | null,
  owner: OwnerSource | null,
) {
  return {
    id: team._id,
    name: franchise?.name ?? null,
    abbr: franchise?.abbr ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    confAbbr: conference?.abbr ?? null,
    ownerNickname: owner?.nickName ?? null,
  };
}

/** Projects only scoring categories consumed by the matchup comparison. */
export function projectMatchupTeamWeekStats(stats: TeamWeekSource) {
  return {
    G: stats.G ?? null,
    A: stats.A ?? null,
    P: stats.P ?? null,
    PM: stats.PM ?? null,
    PIM: stats.PIM ?? null,
    PPP: stats.PPP ?? null,
    SOG: stats.SOG ?? null,
    HIT: stats.HIT ?? null,
    BLK: stats.BLK ?? null,
    W: stats.W ?? null,
    GA: stats.GA ?? null,
    GAA: stats.GAA ?? null,
    SV: stats.SV ?? null,
    SA: stats.SA ?? null,
    SVP: stats.SVP ?? null,
    SO: stats.SO ?? null,
  };
}

/** Joins one player-week row to the referenced player's display identity. */
export function projectMatchupPlayerWeekRow(
  stats: PlayerWeekSource,
  player: PlayerSource | null,
) {
  return {
    id: player?._id ?? stats._id,
    gshlTeamId: stats.gshlTeamId,
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
    fullName: player?.fullName ?? "",
    nhlPos: player?.nhlPos ?? stats.nhlPos ?? [],
    posGroup: player?.posGroup ?? stats.posGroup,
    nhlTeam:
      stats.nhlTeam && stats.nhlTeam.length > 0
        ? stats.nhlTeam
        : (player?.nhlTeam ?? []),
    days: stats.days ?? null,
    GP: stats.GP ?? null,
    GS: stats.GS ?? null,
    G: stats.G ?? null,
    A: stats.A ?? null,
    P: stats.P ?? null,
    PM: stats.PM ?? null,
    PIM: stats.PIM ?? null,
    PPP: stats.PPP ?? null,
    SOG: stats.SOG ?? null,
    HIT: stats.HIT ?? null,
    BLK: stats.BLK ?? null,
    W: stats.W ?? null,
    GA: stats.GA ?? null,
    GAA: stats.GAA ?? null,
    SV: stats.SV ?? null,
    SA: stats.SA ?? null,
    SVP: stats.SVP ?? null,
    SO: stats.SO ?? null,
    Rating: stats.Rating ?? null,
  };
}

/** Returns the unique NHL abbreviations referenced by projected player rows. */
export function collectMatchupNhlAbbreviations(
  players: ReadonlyArray<{ nhlTeam: readonly string[] }>,
) {
  return Array.from(
    new Set(
      players.flatMap((player) =>
        player.nhlTeam.map((abbr) => abbr.trim().toUpperCase()).filter(Boolean),
      ),
    ),
  );
}

/** Projects only the NHL team branding rendered beside player rows. */
export function projectMatchupNhlTeam(team: NhlTeamSource) {
  return {
    id: team._id,
    name: team.name,
    abbr: team.abbr,
    logoUrl: team.logoUrl,
  };
}

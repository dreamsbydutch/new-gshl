/**
 * Player Domain Utilities
 * -----------------------
 * Pure functions for player data filtering, sorting, and transformations.
 */

import type { NHLTeam, Player } from "@gshl-types";
import { isTruthy } from "../core/validation";

type PlayerTeamCarrier = Pick<Player, "nhlTeam">;
type PlayerTeamInput = string | string[] | PlayerTeamCarrier | null | undefined;
type PlayerPositionInput = string | string[] | null | undefined;

const NHL_LOGO_IDENTIFIERS_BY_SLUG = {
  "anaheim-ducks": ["Anaheim Ducks", "ANA", "ANH"],
  "arizona-coyotes": ["Arizona Coyotes", "ARI"],
  "boston-bruins": ["Boston Bruins", "BOS"],
  "buffalo-sabres": ["Buffalo Sabres", "BUF"],
  "calgary-flames": ["Calgary Flames", "CGY", "CAL"],
  "carolina-hurricanes": ["Carolina Hurricanes", "CAR"],
  "chicago-blackhawks": ["Chicago Blackhawks", "CHI"],
  "colorado-avalanche": ["Colorado Avalanche", "COL"],
  "columbus-blue-jackets": ["Columbus Blue Jackets", "CBJ", "CLB"],
  "dallas-stars": ["Dallas Stars", "DAL"],
  "detroit-red-wings": ["Detroit Red Wings", "DET"],
  "edmonton-oilers": ["Edmonton Oilers", "EDM"],
  "florida-panthers": ["Florida Panthers", "FLA"],
  "los-angeles-kings": ["Los Angeles Kings", "LAK", "LA"],
  "minnesota-wild": ["Minnesota Wild", "MIN"],
  "montreal-canadiens": ["Montreal Canadiens", "MON", "MTL"],
  "nashville-predators": ["Nashville Predators", "NSH", "NAS"],
  "new-jersey-devils": ["New Jersey Devils", "NJ", "NJD"],
  "new-york-islanders": ["New York Islanders", "NYI"],
  "new-york-rangers": ["New York Rangers", "NYR"],
  "ottawa-senators": ["Ottawa Senators", "OTT"],
  "philadelphia-flyers": ["Philadelphia Flyers", "PHI"],
  "pittsburgh-penguins": ["Pittsburgh Penguins", "PIT"],
  "san-jose-sharks": ["San Jose Sharks", "SJS", "SJ"],
  "seattle-kraken": ["Seattle Kraken", "SEA"],
  "st-louis-blues": ["St. Louis Blues", "STL"],
  "tampa-bay-lightning": ["Tampa Bay Lightning", "TB", "TBL"],
  "toronto-maple-leafs": ["Toronto Maple Leafs", "TOR"],
  "utah-mammoth": ["Utah Mammoth", "UTA"],
  "vancouver-canucks": ["Vancouver Canucks", "VAN"],
  "vegas-golden-knights": ["Vegas Golden Knights", "VEG", "VGK"],
  "washington-capitals": ["Washington Capitals", "WSH", "WAS"],
  "winnipeg-jets": ["Winnipeg Jets", "WPG", "WIN"],
} as const;

const NHL_LOGO_URL_BY_IDENTIFIER = new Map<string, string>(
  Object.entries(NHL_LOGO_IDENTIFIERS_BY_SLUG).flatMap(([slug, identifiers]) =>
    identifiers.map(
      (identifier) =>
        [identifier.toUpperCase(), `/nhl-logos/${slug}.png`] as const,
    ),
  ),
);

/**
 * Checks whether active player.
 *
 * @param p - The p to use.
 * @returns True when active player; otherwise false.
 */
export const isActivePlayer = (p: Pick<Player, "isActive">): boolean =>
  isTruthy(p.isActive);

/**
 * Checks whether signable player.
 *
 * @param p - The p to use.
 * @returns True when signable player; otherwise false.
 */
export const isSignablePlayer = (p: Pick<Player, "isSignable">): boolean =>
  isTruthy(p.isSignable);

/**
 * Filters free agents.
 *
 * @param players - The players to use.
 * @param checkTeamAssignment - The check team assignment to use.
 * @returns The filtered free agents.
 */
export function filterFreeAgents(
  players: Player[],
  checkTeamAssignment = false,
): Player[] {
  let result = players.filter((p) => isActivePlayer(p) && isSignablePlayer(p));

  if (checkTeamAssignment) {
    result = result.filter((p) => !p.ownerId || p.ownerId.trim() === "");
  }

  return result;
}

/**
 * Filters players by min rating.
 *
 * @param players - The players to use.
 * @param minRating - The min rating to use.
 * @returns The filtered players by min rating.
 */
export function filterPlayersByMinRating(
  players: Player[],
  minRating: number,
): Player[] {
  return players.filter((p) => (p.overallRating ?? 0) >= minRating);
}

/**
 * Sorts players by rating.
 *
 * @param players - The players to use.
 * @param direction - The direction to apply.
 * @returns The sorted players by rating.
 */
export function sortPlayersByRating(
  players: Player[],
  direction: "asc" | "desc" = "desc",
): Player[] {
  return [...players].sort((a, b) => {
    const aRating = a.overallRating ?? 0;
    const bRating = b.overallRating ?? 0;
    return direction === "desc" ? bRating - aRating : aRating - bRating;
  });
}

/**
 * Get free agents filtered and sorted by criteria
 *
 * @param players - Array of players to process
 * @param options - Filtering and sorting options
 * @param options.minRating - Minimum overall rating filter
 * @param options.sortDirection - Sort direction (default: "desc")
 * @param options.checkTeamAssignment - If true, excludes players already assigned to teams
 */
export function getFreeAgents(
  players: Player[],
  options: {
    minRating?: number;
    sortDirection?: "asc" | "desc";
    checkTeamAssignment?: boolean;
  } = {},
): Player[] {
  const {
    minRating,
    sortDirection = "desc",
    checkTeamAssignment = false,
  } = options;

  let result = filterFreeAgents(players, checkTeamAssignment);

  if (minRating !== undefined) {
    result = filterPlayersByMinRating(result, minRating);
  }

  return sortPlayersByRating(result, sortDirection);
}

// Alternate abbreviations in the NHL catalog and supported stat sources.
const NHL_TEAM_ABBREVIATION_ALIASES: Readonly<Record<string, string>> = {
  ANH: "ANA",
  ARZ: "ARI",
  CAL: "CGY",
  CLB: "CBJ",
  CLS: "CBJ",
  LA: "LAK",
  MON: "MTL",
  NAS: "NSH",
  NASH: "NSH",
  NJ: "NJD",
  SJ: "SJS",
  TB: "TBL",
  UTAH: "UTA",
  VEG: "VGK",
  WAS: "WSH",
  WIN: "WPG",
};

function normalizePlayerTeamToken(value: string): string | null {
  const team = value.trim().toUpperCase();
  return team.length > 0 ? (NHL_TEAM_ABBREVIATION_ALIASES[team] ?? team) : null;
}

/**
 * Returns player nhl abbreviations.
 *
 * Supports single-team values and multi-team strings such as "NJD/CGY".
 *
 * @param value - The source value to process.
 * @returns The requested player nhl abbreviations.
 */
export function getPlayerNhlAbbreviations(value: PlayerTeamInput): string[] {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "nhlTeam" in value
  ) {
    return getPlayerNhlAbbreviations(value.nhlTeam ?? null);
  }

  if (Array.isArray(value)) {
    return [
      ...new Set(value.flatMap((team) => getPlayerNhlAbbreviations(team))),
    ];
  }

  if (typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(/[\/,|]/)
        .map((team) => normalizePlayerTeamToken(team))
        .filter((team): team is string => team !== null),
    ),
  ];
}

/**
 * Returns player nhl abbreviation.
 *
 * @param value - The source value to process.
 * @returns The requested player nhl abbreviation.
 */
export function getPlayerNhlAbbreviation(
  value: PlayerTeamInput,
): string | null {
  return getPlayerNhlAbbreviations(value)[0] ?? null;
}

/**
 * Finds nhl team by abbreviation.
 *
 * @param nhlTeams - The nhl teams to use.
 * @param abbreviation - The abbreviation to use.
 * @returns The matching nhl team by abbreviation, if one exists.
 */
export function findNhlTeamByAbbreviation<
  TNhlTeam extends Pick<NHLTeam, "abbr">,
>(
  nhlTeams: readonly TNhlTeam[],
  abbreviation: PlayerTeamInput,
): TNhlTeam | undefined {
  const normalizedAbbreviation =
    getPlayerNhlAbbreviation(abbreviation)?.toUpperCase();
  return normalizedAbbreviation
    ? (nhlTeams.find(
        (team) => team.abbr.trim().toUpperCase() === normalizedAbbreviation,
      ) ??
        nhlTeams.find(
          (team) =>
            normalizePlayerTeamToken(team.abbr) === normalizedAbbreviation,
        ))
    : undefined;
}

/**
 * Resolves an NHL team to the permanent local transparent logo asset.
 *
 * The first token fallback supports display carriers whose name is a stored
 * multi-team abbreviation such as "NJD/CGY".
 */
export function resolveNhlTeamLogoUrl(
  team: Pick<NHLTeam, "name" | "logoUrl">,
): string {
  const normalizedName =
    typeof team.name === "string" ? team.name.trim().toUpperCase() : "";
  const firstIdentifier = normalizedName.split(/[\/,|]/)[0]?.trim();

  return (
    NHL_LOGO_URL_BY_IDENTIFIER.get(normalizedName) ??
    (firstIdentifier
      ? NHL_LOGO_URL_BY_IDENTIFIER.get(firstIdentifier)
      : undefined) ??
    team.logoUrl
  );
}

/**
 * Formats player position list for display.
 *
 * @param positions - The positions to use.
 * @param fallback - The fallback to use.
 * @returns The formatted player position list.
 */
export function formatPlayerPositionList(
  positions: PlayerPositionInput,
  fallback = "-",
): string {
  if (Array.isArray(positions)) {
    return positions.length > 0 ? positions.join("/") : fallback;
  }

  if (typeof positions === "string") {
    const value = positions.trim();
    return value || fallback;
  }

  return fallback;
}

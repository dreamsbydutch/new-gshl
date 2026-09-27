import type { GSHLTeam, Player, PlayerDayStatLine } from "@gshl-types";
import type { NHLGame } from "@gshl-lib/types/nhl";
import {
  buildNHLMatchupPlayers,
  nhlMatchupRosterSchema,
} from "@gshl-utils/features/nhl-matchup";
import { getPlayerNhlAbbreviations } from "@gshl-utils/domain/player";

type RosterPlayer = Parameters<
  typeof buildNHLMatchupPlayers
>[0]["players"][number];
type RosterDay = Parameters<typeof buildNHLMatchupPlayers>[0]["days"][number];
type RosterTeam = Parameters<
  typeof buildNHLMatchupPlayers
>[0]["teams"][number] &
  Pick<GSHLTeam, "ownerId">;

export interface NHLMatchupReader {
  seasons(endingYear: number): Promise<{ id: string }[]>;
  teams(seasonId: string): Promise<RosterTeam[]>;
  datePage(
    seasonId: string,
    date: string,
    cursor: string | null,
  ): Promise<{
    items: RosterDay[];
    nextCursor: string | null;
    hasMore: boolean;
  }>;
  playersByIds(ids: string[]): Promise<RosterPlayer[]>;
  playersByOwner(
    ownerId: string,
  ): Promise<(RosterPlayer & Pick<Player, "ownerId">)[]>;
}

/** Read only one indexed date, never the generic season-wide stats list. */
export async function loadNHLMatchupRoster(
  game: NHLGame,
  reader: NHLMatchupReader,
  now = Date.now(),
) {
  const season = (await reader.seasons(game.season % 10000))[0] ?? null;
  if (!season) return { season, players: [], updatedAt: now };
  const teams = await reader.teams(season.id);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  const upcoming = ["FUT", "PRE"].includes(game.gameState);
  const allowCurrentRoster =
    upcoming ||
    (game.gameDate >= today && !["OFF", "FINAL"].includes(game.gameState));
  const matchesNHLTeam = (value: PlayerDayStatLine["nhlTeam"]) =>
    getPlayerNhlAbbreviations(value).some(
      (abbr) => abbr === game.awayTeam.abbrev || abbr === game.homeTeam.abbrev,
    );
  const days: RosterDay[] = [];
  if (!upcoming) {
    let cursor: string | null = null;
    // A league date fits well below 2,000 rows. Fail rather than return a partial roster.
    for (let pageNumber = 0; ; pageNumber++) {
      if (pageNumber >= 20)
        throw new Error("NHL matchup date exceeded its row budget");
      const page = await reader.datePage(season.id, game.gameDate, cursor);
      days.push(
        ...page.items.filter(
          (day) => day.date === game.gameDate && matchesNHLTeam(day.nhlTeam),
        ),
      );
      if (!page.hasMore) break;
      if (!page.nextCursor || page.nextCursor === cursor)
        throw new Error("Invalid roster page cursor");
      cursor = page.nextCursor;
    }
  }
  const players: RosterPlayer[] = [];
  if (allowCurrentRoster) {
    const ownerTeams = new Map(
      teams.filter((team) => team.ownerId).map((team) => [team.ownerId!, team]),
    );
    const rosters = await Promise.all(
      [...ownerTeams].map(async ([ownerId, team]) =>
        (await reader.playersByOwner(ownerId))
          .filter(
            (player) =>
              player.ownerId === ownerId && matchesNHLTeam(player.nhlTeam),
          )
          .map((player) => ({ ...player, gshlTeamId: team.id })),
      ),
    );
    players.push(...rosters.flat());
  }
  if (days.length)
    players.push(
      ...(await reader.playersByIds([
        ...new Set(days.map((day) => day.playerId)),
      ])),
    );
  return nhlMatchupRosterSchema.parse({
    season: { id: season.id },
    updatedAt: now,
    players: buildNHLMatchupPlayers({
      game,
      teams,
      days,
      players,
      allowCurrentRoster,
    }),
  });
}

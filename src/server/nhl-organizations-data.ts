import { z } from "zod";
import {
  mergeNhlOrganizationSources,
  nhlOrganizationsSchema,
  nhlOrganizationDirectorySchema,
} from "../lib/utils/features/nhl-organizations";
import type { NhlOrganizations } from "../lib/types/nhl-organizations";

let nextRequestAt = 0;

const clubsSchema = z.object({
  standings: z
    .array(
      z.object({
        seasonId: z.number().int(),
        teamAbbrev: z.object({ default: z.string().regex(/^[A-Z]{2,3}$/) }),
        teamName: z.object({ default: z.string().min(1) }),
      }),
    )
    .length(32),
});

export async function loadNhlOrganizations(
  seasonId: number,
  read: (path: string) => Promise<unknown> = async (path) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const scheduled = Math.max(Date.now(), nextRequestAt);
      nextRequestAt = scheduled + 250;
      if (scheduled > Date.now())
        await new Promise((resolve) =>
          setTimeout(resolve, scheduled - Date.now()),
        );
      const url =
        path === "directory"
          ? "https://search.d3.nhle.com/api/v1/search/player?culture=en-us&q=*&active=true&limit=10000"
          : `https://api-web.nhle.com/v1/${path}`;
      const r = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) return r.json();
      if (![429, 502, 503, 504].includes(r.status) || attempt === 2)
        throw Error("NHL organization source unavailable");
      const delay = Math.min(
        30000,
        Math.max(
          1000,
          Number(r.headers.get("retry-after")) * 1000 || (attempt + 1) * 1000,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw Error("NHL organization source unavailable");
  },
): Promise<NhlOrganizations> {
  const clubs = clubsSchema.parse(await read("standings/now")).standings;
  if (
    clubs.some((c) => c.seasonId !== seasonId) ||
    new Set(clubs.map((c) => c.teamAbbrev.default)).size !== clubs.length
  )
    throw Error("NHL organization season mismatch");
  const teams: NhlOrganizations["teams"] = [];
  const directory = nhlOrganizationDirectorySchema.parse(
    await read("directory"),
  );
  if (new Set(directory.map((p) => p.playerId)).size !== directory.length)
    throw Error("Duplicate NHL organization directory identity");
  // Two workers bound concurrent club requests; the shared reader also throttles starts.
  const queue = [...clubs];
  await Promise.all(
    Array.from({ length: Math.min(2, clubs.length) }, async () => {
      for (let club = queue.shift(); club; club = queue.shift()) {
        const abbr = club.teamAbbrev.default;
        const roster = await read(`roster/${abbr}/current`);
        const depth = directory
          .filter((p) => p.active && p.teamAbbrev === abbr)
          .map((p) => ({
            nhlPlayerId: Number(p.playerId),
            playerName: p.name,
            position:
              p.positionCode === "D" ? "D" : p.positionCode === "G" ? "G" : "F",
            membership: "organization",
          }));
        const players = mergeNhlOrganizationSources(roster, depth);
        if (!players.some((p) => p.membership === "nhl-roster"))
          throw Error("Empty current NHL roster");
        teams.push({ abbr, name: club.teamName.default, roster: players });
      }
    }),
  );
  // A current NHL roster overrides a stale directory association after a trade.
  const rosterClub = new Map<number, string>();
  for (const t of teams)
    for (const p of t.roster.filter((p) => p.membership === "nhl-roster")) {
      if (rosterClub.has(p.nhlPlayerId))
        throw Error("Conflicting current NHL roster identity");
      rosterClub.set(p.nhlPlayerId, t.abbr);
    }
  const seen = new Set<number>();
  for (const t of teams) {
    t.roster = t.roster.filter(
      (p) =>
        !rosterClub.has(p.nhlPlayerId) ||
        rosterClub.get(p.nhlPlayerId) === t.abbr,
    );
    for (const p of t.roster) {
      if (seen.has(p.nhlPlayerId))
        throw Error("Conflicting NHL organization identity");
      seen.add(p.nhlPlayerId);
    }
  }
  return nhlOrganizationsSchema.parse({
    seasonId,
    updatedAt: Date.now(),
    teams: teams.sort((a, b) => a.abbr.localeCompare(b.abbr)),
  });
}

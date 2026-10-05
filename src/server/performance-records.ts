import "server-only";
import { RECORD_STATS } from "@gshl-utils/features/performance-records";
import type { Value } from "convex/values";
import { env } from "@gshl-env";
import { unstable_cache } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import {
  loadMatchupRecords,
  type RecordRow as Row,
} from "./performance-records-data";
function read(path: string, where: Record<string, Value> = {}, take = 2001) {
  const client = new ConvexHttpClient(
    env.CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL!,
  );
  return client
    .query(
      makeFunctionReference<
        "query",
        { where: Record<string, Value>; take: number },
        Row[]
      >("frontend:" + path),
      { where, take },
    )
    .then((rows) => {
      if (rows.length >= take)
        throw new Error("Record comparison exceeds its bounded scope");
      return rows;
    });
}
const calendar = unstable_cache(
  async () => {
    const [seasons, weeks] = await Promise.all([
      read("seasons", {}, 101),
      read("weeks"),
    ]);
    return { seasons, weeks };
  },
  ["record-calendar-v1"],
  { revalidate: 300 },
);
const weekRows = unstable_cache(
  async (seasonId: string, weekId: string) => {
    const where = { seasonId, weekId };
    const [teams, players, matchups] = await Promise.all([
      read("teamWeekStats", where, 101),
      read("playerWeekStats", where, 1001),
      read("matchups", where, 101),
    ]);
    const compact = (row: Row): Row =>
      Object.fromEntries(
        ["id", "gshlTeamId", "playerId", "GP", "GS", ...RECORD_STATS].map(
          (key) => [key, row[key]],
        ),
      ) as Row;
    return {
      teams: teams.map(compact),
      players: players.map(compact),
      matchups,
    };
  },
  ["record-week-v1"],
  { revalidate: 300 },
);

const entityName = unstable_cache(
  async (kind: "team" | "player", id: string) => {
    const [row] = await read(kind === "team" ? "teams" : "players", { id }, 2);
    const name = row?.fullName ?? row?.name;
    return typeof name === "string"
      ? name
      : kind === "team"
        ? "Team"
        : "Player";
  },
  ["record-entity-name-v1"],
  { revalidate: 3600 },
);
export async function getMatchupRecords(matchupId: string) {
  const result = await loadMatchupRecords(
    matchupId,
    {
      matchup: (id) => read("matchups", { id }, 2),
      calendar,
      week: weekRows,
    },
    Date.now(),
  );
  const names = new Map<string, Promise<string>>();
  for (const badge of result.badges)
    for (const example of badge.examples) {
      const key = example.kind + ":" + example.entityId;
      if (!names.has(key))
        names.set(key, entityName(example.kind, example.entityId));
    }
  await Promise.all(names.values());
  for (const badge of result.badges)
    for (const example of badge.examples) {
      example.label =
        (await names.get(example.kind + ":" + example.entityId)) +
        " - " +
        example.label;
    }
  return result;
}

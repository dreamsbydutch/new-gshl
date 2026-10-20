import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { parseNhlReportPage } from "./season-rating-source";
import {
  nightlyNhlReadiness,
  normalizeNightlyNhlPlayers,
  normalizeNightlyNhlTeams,
  validateNhlNightlyScope,
  type NightlyScheduleGame,
} from "../../domains/nhl/nightly-season-stats";
import type { NhlStatRow } from "../../domains/nhl/season-rating-input";

export type NightlyPublicEvidence = {
  url: string;
  fetchedAt: string;
  sha256: string;
  body: unknown;
};
export async function fetchNightlyNhlSnapshot(
  date: string,
  season: number,
  options: {
    readJson?: (url: string) => Promise<unknown>;
    wait?: (ms: number) => Promise<unknown>;
  } = {},
) {
  validateNhlNightlyScope(date, season);
  const evidence: NightlyPublicEvidence[] = [];
  const wait = options.wait ?? delay;
  const read = async (url: string) => {
    let body: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (options.readJson) body = await options.readJson(url);
        else {
          const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) throw Error(`NHL HTTP ${r.status}`);
          body = await r.json();
        }
        break;
      } catch {
        if (attempt === 2)
          throw Error(
            `Public NHL source unavailable: ${new URL(url).pathname}`,
          );
        await wait(1000 * 2 ** attempt);
      }
    }
    evidence.push({
      url,
      fetchedAt: new Date().toISOString(),
      sha256: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
      body,
    });
    await wait(100);
    return body;
  };
  const schedule = async () => {
    const body = (await read(
      `https://api-web.nhle.com/v1/schedule/${date}`,
    )) as { gameWeek?: { date: string; games: NightlyScheduleGame[] }[] };
    const day = body?.gameWeek?.find((d) => d.date === date);
    if (!day || !Array.isArray(day.games))
      throw Error("Requested NHL schedule date unavailable");
    return day.games;
  };
  const before = await schedule(),
    readiness = nightlyNhlReadiness(before, season);
  if (!readiness.ready)
    return {
      version: "nhl-nightly-source-v1" as const,
      date,
      season,
      status: "deferred" as const,
      readiness,
      evidence,
    };
  const report = async (
    kind: "skater" | "goalie" | "team",
    name: string,
    isGame = false,
  ) => {
    const rows: NhlStatRow[] = [];
    let total: number | undefined;
    for (let start = 0; start < 20000; start += 100) {
      const params = new URLSearchParams({
        isAggregate: "false",
        isGame: String(isGame),
        start: String(start),
        limit: "100",
        sort: JSON.stringify(
          isGame
            ? [
                { property: "gameId", direction: "ASC" },
                { property: "playerId", direction: "ASC" },
              ]
            : [
                {
                  property: kind === "team" ? "teamId" : "playerId",
                  direction: "ASC",
                },
              ],
        ),
        cayenneExp: `seasonId=${season} and gameTypeId=2`,
      });
      const page = parseNhlReportPage(
        await read(
          `https://api.nhle.com/stats/rest/en/${kind}/${name}?${params}`,
        ),
      );
      if (total !== undefined && total !== page.total)
        throw Error("NHL source changed during pagination");
      total = page.total;
      rows.push(...page.data);
      if (rows.length === total) return rows;
      if (!page.data.length || rows.length > total)
        throw Error("Incomplete NHL report pagination");
    }
    throw Error("NHL season report bound exceeded");
  };
  // Serial requests preserve the global public-source throttle within this job.
  const skaters = await report("skater", "summary");
  const timeonice = await report("skater", "timeonice");
  const realtime = await report("skater", "realtime");
  const goalies = await report("goalie", "summary");
  const goalieGames = await report("goalie", "summary", true);
  const teamSummary = await report("team", "summary");
  const directory = parseNhlReportPage(
    await read("https://api.nhle.com/stats/rest/en/team?limit=1000"),
  ).data;
  const gamesPage = parseNhlReportPage(
    await read(
      `https://api.nhle.com/stats/rest/en/game?cayenneExp=season=${season}%20and%20gameType=2&limit=2000`,
    ),
  );
  if (
    gamesPage.data.length !== gamesPage.total ||
    gamesPage.data.some((g) => g.season !== season || g.gameType !== 2) ||
    new Set(gamesPage.data.map((g) => g.id)).size !== gamesPage.total
  )
    throw Error("Incomplete official season schedule");
  const completedGameIds = gamesPage.data
    .filter((g) => g.gameStateId === 7)
    .map((g) => Number(g.id));
  if (
    readiness.gameIds.some(
      (id) =>
        before.find((g) => g.id === id)?.gameType === 2 &&
        !completedGameIds.includes(id),
    )
  )
    throw Error("Official season reports have not finalized requested games");
  const players = normalizeNightlyNhlPlayers({
    season,
    skaters,
    timeonice,
    realtime,
    goalies,
    goalieGames,
    completedGameIds,
  });
  const teams = normalizeNightlyNhlTeams(
    teamSummary,
    directory,
    season,
    completedGameIds.length,
  );
  const after = await schedule();
  if (
    JSON.stringify([...before].sort((a, b) => a.id - b.id)) !==
    JSON.stringify([...after].sort((a, b) => a.id - b.id))
  )
    throw Error("NHL schedule changed during source snapshot; retry");
  return {
    version: "nhl-nightly-source-v1" as const,
    date,
    season,
    status: "ready" as const,
    readiness,
    sourceFetchedAt: new Date().toISOString(),
    players,
    teams,
    completedGameIds,
    evidence,
    policy: {
      gameType: 2,
      QS: "Starter SV/SA >= season league SV/SA OR SA<=20 and SV/SA>=.885",
      RBS: "Starter SV/SA<.85; zero-shot starts neither QS nor RBS",
      hockey:
        "Fresh native stats do not refit reviewed hockey values; changed source fingerprint withholds stale contribution",
      asOf: "Actual source fetch time, not a historical point-in-time snapshot",
    },
  };
}

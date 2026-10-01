import { setTimeout as delay } from "node:timers/promises";
import {
  NHL_RATING_REPORTS,
  type NhlRatingSource,
  type NhlStatRow,
} from "../../domains/nhl/season-rating-input";
import {
  validateNhlRatingInput,
  type NhlRatingProfile,
} from "../../runtime/nhl-season-rating";

async function requestJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(
          `NHL HTTP ${response.status}: ${new URL(url).pathname}`,
        );
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(1000 * 2 ** attempt);
    }
  }
  throw new Error("NHL request exhausted");
}

export function parseNhlReportPage(data: unknown): {
  data: NhlStatRow[];
  total: number;
} {
  if (
    !data ||
    typeof data !== "object" ||
    !("data" in data) ||
    !("total" in data) ||
    !Array.isArray(data.data) ||
    !Number.isInteger(data.total) ||
    Number(data.total) < 0 ||
    data.data.some(
      (row) => !row || typeof row !== "object" || Array.isArray(row),
    )
  )
    throw new Error("Malformed NHL statistics page");
  return { data: data.data as NhlStatRow[], total: Number(data.total) };
}

async function report(
  kind: "skater" | "goalie",
  name: string,
  season: number,
  gameType: number,
) {
  const rows: NhlStatRow[] = [];
  let expected: number | undefined;
  for (let start = 0; start < 10000; start += 100) {
    const params = new URLSearchParams({
      start: String(start),
      limit: "100",
      isAggregate: "false",
      isGame: "false",
      sort: JSON.stringify([{ property: "playerId", direction: "ASC" }]),
      cayenneExp: `seasonId=${season} and gameTypeId=${gameType}`,
    });
    const page = parseNhlReportPage(
      await requestJson(
        `https://api.nhle.com/stats/rest/en/${kind}/${name}?${params}`,
      ),
    );
    if (expected !== undefined && expected !== page.total)
      throw new Error(
        "NHL report changed during pagination; retry the snapshot",
      );
    expected = page.total;
    rows.push(...page.data);
    if (rows.length === page.total) return rows;
    if (!page.data.length || rows.length > page.total)
      throw new Error("Incomplete NHL pagination");
    await delay(100);
  }
  throw new Error("NHL report exceeded the 10,000-row season limit");
}

/** Explicit counts avoid the different sign/scope of scoringRates.netMinorPenaltiesPer60. */
export async function fetchNhlPenaltyReport(season: number, gameType: 2 | 3) {
  validateNhlRatingInput({ season, gameType, profile: "core", players: [] });
  return report("skater", "penalties", season, gameType);
}

/** Public NHL reads only. Does not load credentials or connect to Convex. */
export async function fetchNhlRatingSource(
  season: number,
  gameType: 2 | 3,
  profile: NhlRatingProfile,
  log: (message: string) => void = () => {},
): Promise<NhlRatingSource> {
  validateNhlRatingInput({ season, gameType, profile, players: [] });
  const skaters = {} as NhlRatingSource["skaters"];
  for (const name of NHL_RATING_REPORTS) {
    log(`Fetching NHL skater ${name} (${season}, game type ${gameType})`);
    skaters[name] = await report("skater", name, season, gameType);
    await delay(100);
  }
  const goalies = await report("goalie", "summary", season, gameType);
  if (!skaters.summary.length || !goalies.length)
    throw new Error("No NHL player data for this season/game type");
  const source: NhlRatingSource = {
    season,
    gameType,
    profile,
    fetchedAt: new Date().toISOString(),
    skaters,
    goalies,
    edge: {},
    warnings: [],
  };
  if (profile === "edge") {
    if (season < 20212022)
      throw new Error(
        "EDGE profile requires 2021-22 or later; use core for earlier seasons",
      );
    const all = [
      ...skaters.summary.map((row) => ({ row, kind: "skater" })),
      ...goalies.map((row) => ({ row, kind: "goalie" })),
    ];
    for (const [i, { row, kind }] of all.entries()) {
      if (i % 50 === 0) log(`Fetching NHL EDGE ${i}/${all.length}`);
      const data = await requestJson(
        `https://api-web.nhle.com/v1/edge/${kind}-detail/${String(row.playerId)}/${season}/${gameType}`,
      );
      if (data && typeof data === "object" && "player" in data) {
        const player = data.player as { id?: unknown } | null;
        if (player?.id !== row.playerId)
          throw new Error("EDGE returned a different player");
        source.edge[String(row.playerId)] = data as NhlStatRow;
      } else
        source.warnings.push(
          `EDGE unavailable for ${String(row.playerId)}; player will be incomplete, not silently scored with core`,
        );
      await delay(100);
    }
  }
  return source;
}

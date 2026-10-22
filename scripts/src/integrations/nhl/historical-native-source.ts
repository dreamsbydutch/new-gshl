import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { fetchNightlyNhlSnapshot } from "./nightly-season-source";
import { planHistoricalNhlMetadata } from "../../domains/nhl/historical-native-backfill";

type Source = Awaited<ReturnType<typeof fetchNightlyNhlSnapshot>>;
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** All reads resolve inside the frozen evidence; an absent URL is a hard error. */
export async function auditHistoricalNativeSource(input: unknown) {
  const source = input as Source;
  if (
    !source ||
    source.version !== "nhl-nightly-source-v1" ||
    source.status !== "ready" ||
    !Array.isArray(source.evidence)
  )
    throw Error("Complete frozen NHL source required");
  const sourceTime = Date.parse(source.sourceFetchedAt);
  if (
    !Number.isSafeInteger(sourceTime) ||
    sourceTime <= 0 ||
    sourceTime > Date.now() + 300000
  )
    throw Error("Invalid frozen source timestamp");
  const bodies = new Map<string, unknown>();
  for (const evidence of source.evidence) {
    if (
      !/^[a-f0-9]{64}$/.test(evidence.sha256) ||
      sha(evidence.body) !== evidence.sha256 ||
      !Number.isFinite(Date.parse(evidence.fetchedAt))
    )
      throw Error("Frozen official evidence hash/date mismatch");
    if (
      bodies.has(evidence.url) &&
      !isDeepStrictEqual(bodies.get(evidence.url), evidence.body)
    )
      throw Error("Conflicting frozen source URL");
    bodies.set(evidence.url, evidence.body);
  }
  const replay = await fetchNightlyNhlSnapshot(source.date, source.season, {
    readJson: async (url) => {
      if (!bodies.has(url)) throw Error("Missing frozen official URL");
      return structuredClone(bodies.get(url));
    },
    wait: async () => {},
  });
  if (replay.status !== "ready") throw Error("Frozen native replay deferred");
  for (const key of [
    "season",
    "date",
    "players",
    "teams",
    "completedGameIds",
    "readiness",
    "policy",
  ] as const) {
    if (!isDeepStrictEqual(source[key], replay[key]))
      throw Error(`Frozen native replay mismatch: ${key}`);
  }
  const gameUrl = `https://api.nhle.com/stats/rest/en/game?cayenneExp=season=${source.season}%20and%20gameType=2&limit=2000`;
  const games = bodies.get(gameUrl) as
    | { total?: unknown; data?: Record<string, unknown>[] }
    | undefined;
  const directory = bodies.get(
    "https://api.nhle.com/stats/rest/en/team?limit=1000",
  ) as { total?: unknown; data?: Record<string, unknown>[] } | undefined;
  if (
    !games ||
    !Array.isArray(games.data) ||
    games.total !== games.data.length ||
    !directory ||
    !Array.isArray(directory.data) ||
    directory.total !== directory.data.length
  )
    throw Error("Incomplete frozen official game/team directory");
  if (
    !isDeepStrictEqual(
      games.data.map((g) => g.id).sort((a, b) => Number(a) - Number(b)),
      [...source.completedGameIds].sort((a, b) => a - b),
    )
  )
    throw Error("Historical source omits completed games");
  // Reuse the pure scope/calendar validation before returning trusted rows.
  planHistoricalNhlMetadata({
    season: source.season,
    games: games.data,
    officialTeams: directory.data,
    requiredTeams: source.teams,
    seasons: [],
    teams: [],
  });
  return { source, games: games.data, officialTeams: directory.data };
}

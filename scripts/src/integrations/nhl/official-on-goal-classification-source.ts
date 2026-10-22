import { createHash } from "node:crypto";
import type { HockeyDataCache } from "./game-value-source";
import type { SeasonPlayerReference } from "../../runtime/nhl-game-season-value";
import {
  parseOfficialOnGoalClassification,
  reviewedOnGoalClassificationGroups,
  REVIEWED_ON_GOAL_CLASSIFICATION_GAMES,
  type OfficialOnGoalClassificationProof,
  type OnGoalOfficialGameRow,
} from "../../domains/nhl/official-on-goal-classification";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const proofKey = (gameId: number) =>
  `official-on-goal-classification-${gameId}`;

export async function replayOfficialOnGoalClassification(
  cache: HockeyDataCache,
  gameId: number,
  effectivePbpOverride?: unknown,
) {
  cache = cache.retainedView();
  const scope = REVIEWED_ON_GOAL_CLASSIFICATION_GAMES.find(
    (g) => g.gameId === gameId,
  );
  if (!scope) throw Error("Classification source is outside reviewed scope");
  const { fetchGamePlayByPlay, fetchSeasonGames } = await import(
    "./game-value-source"
  );
  const year = Math.floor(gameId / 1e6),
    season = year * 10001 + 1;
  const pbp = (
    effectivePbpOverride === undefined
      ? await fetchGamePlayByPlay(cache, gameId)
      : effectivePbpOverride
  ) as {
    id: number;
    gameDate: string;
    homeTeam: { id: number };
    awayTeam: { id: number };
  };
  const schedule = (await fetchSeasonGames(cache, season, 2))
    .slice()
    .sort((a, b) => a.id - b.id);
  const index = schedule.findIndex((g) => g.id === gameId);
  if (index < 0)
    throw Error("Classification game is outside official schedule");
  const offset = Math.floor(index / 100) * 100;
  const game = schedule[index]!;
  if (
    pbp.id !== gameId ||
    pbp.gameDate !== game.gameDate ||
    pbp.homeTeam.id !== game.homeTeamId ||
    pbp.awayTeam.id !== game.visitingTeamId
  )
    throw Error(
      "Classification effective source differs from official schedule",
    );
  const batch = schedule.slice(offset, offset + 100);
  const filter = `gameId>=${batch[0]!.id} and gameId<=${batch.at(-1)!.id}`;
  const official: OnGoalOfficialGameRow[] = [],
    summarySources = [];
  for (const kind of ["skater", "goalie"] as const) {
    const params = new URLSearchParams({
      isAggregate: "false",
      isGame: "true",
      start: "0",
      limit: "-1",
      cayenneExp: filter,
    });
    const url = `https://api.nhle.com/stats/rest/en/${kind}/summary?${params}`;
    const bytes = await cache.retainedBytes(url);
    const page = JSON.parse(bytes.toString("utf8")) as {
      total: number;
      data: Array<Record<string, unknown>>;
    };
    const ids = new Set(batch.map((g) => g.id));
    if (
      !Array.isArray(page.data) ||
      page.total !== page.data.length ||
      page.total >= 10000 ||
      page.data.some(
        (row) => !ids.has(Number(row.gameId)) || row.gamesPlayed !== 1,
      )
    )
      throw Error("Invalid complete classification player-game source");
    summarySources.push({ url, sha256: hash(bytes) });
    for (const row of page.data.filter((row) => row.gameId === gameId)) {
      if (
        !["H", "R"].includes(String(row.homeRoad)) ||
        row.gameDate !== pbp.gameDate ||
        (kind === "skater" &&
          !["C", "L", "R", "D"].includes(String(row.positionCode)))
      )
        throw Error("Invalid classification official date/venue/role");
      official.push({
        gameId,
        date: pbp.gameDate,
        playerId: Number(row.playerId),
        teamId: row.homeRoad === "H" ? pbp.homeTeam.id : pbp.awayTeam.id,
        position:
          kind === "goalie" ? "G" : row.positionCode === "D" ? "D" : "F",
        gamesPlayed: 1,
        goals: Number(kind === "goalie" ? row.goalsAgainst : row.goals),
        onGoal: Number(kind === "goalie" ? row.shotsAgainst : row.shots),
      });
    }
  }
  const suffix = String(gameId % 1e6).padStart(6, "0");
  const reportUrl = `https://www.nhl.com/scores/htmlreports/${season}/PL${suffix}.HTM`;
  const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
  const [report, box] = await Promise.all([
    cache.retainedBytes(reportUrl),
    cache.retainedBytes(boxUrl),
  ]);
  const proof = parseOfficialOnGoalClassification(
    report.toString("utf8"),
    pbp,
    JSON.parse(box.toString("utf8")),
    official,
    scope.playerIds,
    {
      pbpSha256: hash(JSON.stringify(pbp)),
      htmlSha256: hash(report),
      boxSha256: hash(box),
      officialSummarySha256: hash(JSON.stringify(summarySources)),
    },
  );
  return {
    proof,
    urls: [
      `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
      reportUrl,
      boxUrl,
      ...summarySources.map((s) => s.url),
    ],
  };
}

/** Every saved group is independently replayed from retained primary sources. */
export async function loadReviewedOnGoalClassifications(
  cache: HockeyDataCache,
  season: number,
) {
  const groups = [];
  for (const { gameId } of REVIEWED_ON_GOAL_CLASSIFICATION_GAMES) {
    if (Math.floor(gameId / 1e6) !== Math.floor(season / 10000)) continue;
    const proof = await cache.derived<OfficialOnGoalClassificationProof>(
      proofKey(gameId),
    );
    if (!proof) continue;
    const replayed = await replayOfficialOnGoalClassification(cache, gameId);
    if (JSON.stringify(replayed.proof) !== JSON.stringify(proof))
      throw Error("Reviewed on-goal classification proof changed");
    groups.push(...reviewedOnGoalClassificationGroups(replayed.proof));
  }
  return groups;
}

export async function withReviewedOnGoalClassifications<
  T extends SeasonPlayerReference,
>(cache: HockeyDataCache, season: number, reference: readonly T[]) {
  const groups = await loadReviewedOnGoalClassifications(cache, season);
  const ids = new Set(reference.map((p) => p.playerId));
  if (ids.size !== reference.length || groups.some((g) => !ids.has(g.playerId)))
    throw Error("Reviewed classification reference population differs");
  return reference.map((p) => {
    const selected = groups.filter((g) => g.playerId === p.playerId);
    if (p.reviewedOnGoalClassifications !== undefined)
      throw Error("Classification reference was already decorated");
    return selected.length
      ? { ...p, reviewedOnGoalClassifications: selected }
      : p;
  });
}

/** Explicit local additive collection after independent source review. */
export async function collectOfficialOnGoalClassification(
  cache: HockeyDataCache,
  gameId: number,
) {
  const result = await replayOfficialOnGoalClassification(cache, gameId);
  await cache.saveDerived(proofKey(gameId), result.proof, result.urls);
  if (
    JSON.stringify(await cache.derived(proofKey(gameId))) !==
    JSON.stringify(result.proof)
  )
    throw Error("Classification proof readback differs");
  return result.proof;
}

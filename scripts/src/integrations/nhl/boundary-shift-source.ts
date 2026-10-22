import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { clockSeconds } from "../../domains/nhl/game-value-input";
import type { HockeyDataCache } from "./game-value-source";
import {
  BOUNDARY_SHIFT_GAMES,
  reconcileBoundaryShiftReports,
  validateBoundaryShiftProof,
  type BoundaryShiftProof,
} from "../../domains/nhl/boundary-shift-reconciliation";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const BOUNDARY_SHIFT_PARSER_FILES = [
  "scripts/src/domains/nhl/official-shift-report.ts",
  "scripts/src/domains/nhl/game-value-input.ts",
  "scripts/src/domains/nhl/official-game-clock.ts",
  "scripts/src/domains/nhl/boundary-shift-reconciliation.ts",
  "scripts/src/domains/nhl/boundary-shift-2008-cases.ts",
  "scripts/src/integrations/nhl/boundary-shift-source.ts",
] as const;
export async function boundaryShiftParserBinding(root = process.cwd()) {
  const files = await Promise.all(
    BOUNDARY_SHIFT_PARSER_FILES.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(root, path))),
    })),
  );
  return { files, sha256: hash(JSON.stringify(files)) };
}
export function boundaryShiftProofKey(
  gameId: number,
  parserBindingSha256: string,
  effectivePbpSha256: string,
) {
  if (
    !/^[a-f0-9]{64}$/.test(parserBindingSha256) ||
    !/^[a-f0-9]{64}$/.test(effectivePbpSha256) ||
    !BOUNDARY_SHIFT_GAMES.some((id) => id === gameId)
  )
    throw new Error("Invalid boundary-shift proof key");
  return `reviewed-boundary-shifts-${gameId}-${parserBindingSha256}-${effectivePbpSha256}`;
}

/** Read-only replay. Proof creation is a separately reviewed collector action. */
export async function loadReviewedBoundaryShifts(
  cache: HockeyDataCache,
  proof: BoundaryShiftProof,
  effectivePbp: unknown,
) {
  validateBoundaryShiftProof(proof);
  const binding = await boundaryShiftParserBinding();
  if (binding.sha256 !== proof.parserBindingSha256)
    throw new Error(
      "Boundary-shift parser binding changed; new review required",
    );
  const id = proof.gameId,
    year = Math.floor(id / 1e6),
    season = year * 10001 + 1,
    suffix = String(id % 1e6).padStart(6, "0");
  const exactUrls: Record<string, string> = {
    pbp: `https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`,
    "home-report": `https://www.nhl.com/scores/htmlreports/${season}/TH${suffix}.HTM`,
    "away-report": `https://www.nhl.com/scores/htmlreports/${season}/TV${suffix}.HTM`,
    schedule: `https://api.nhle.com/stats/rest/en/game?cayenneExp=season=${season}%20and%20gameType=2&limit=2000`,
  };
  for (const [role, url] of Object.entries(exactUrls)) {
    const entries = proof.evidence.filter((e) => e.role === role);
    if (entries.length !== 1 || entries[0]!.url !== url)
      throw new Error(`Missing/mixed boundary-shift ${role} evidence`);
  }
  for (const role of ["shift-page", "skater-summary", "goalie-summary"])
    if (!proof.evidence.some((e) => e.role === role))
      throw new Error(`Missing boundary-shift ${role} evidence`);
  const bodies = new Map<string, Buffer>();
  let canonicalBatchExpression: string | undefined;
  for (const entry of proof.evidence) {
    if (
      !(entry.role in exactUrls) &&
      !["shift-page", "skater-summary", "goalie-summary"].includes(entry.role)
    )
      throw new Error("Unsupported boundary-shift evidence role");
    if (!(entry.role in exactUrls)) {
      const url = new URL(entry.url),
        path =
          entry.role === "shift-page"
            ? "shiftcharts"
            : `${entry.role === "skater-summary" ? "skater" : "goalie"}/summary`;
      const exp = url.searchParams.get("cayenneExp") ?? "";
      const range = exp.match(/^gameId>=(\d+) and gameId<=(\d+)$/);
      const expected =
        entry.role === "shift-page"
          ? {
              limit: "10000",
              sort: JSON.stringify([{ property: "id", direction: "ASC" }]),
            }
          : { isAggregate: "false", isGame: "true", start: "0", limit: "-1" };
      const allowed = new Set([
        "cayenneExp",
        "start",
        ...Object.keys(expected),
      ]);
      if (
        url.origin !== "https://api.nhle.com" ||
        url.pathname !== `/stats/rest/en/${path}` ||
        !range ||
        Number(range[1]) > id ||
        Number(range[2]) < id ||
        Math.floor(Number(range[1]) / 1e6) !== year ||
        Math.floor(Number(range[2]) / 1e6) !== year ||
        [...url.searchParams.keys()].some(
          (key) =>
            !allowed.has(key) || url.searchParams.getAll(key).length !== 1,
        ) ||
        Object.entries(expected).some(
          ([key, value]) => url.searchParams.get(key) !== value,
        ) ||
        (canonicalBatchExpression !== undefined &&
          exp !== canonicalBatchExpression)
      )
        throw new Error("Mixed raw shift/roster evidence scope");
      canonicalBatchExpression = exp;
    }
    const bytes = await cache.retainedBytes(entry.url);
    if (hash(bytes) !== entry.sha256)
      throw new Error("Boundary-shift source bytes changed");
    bodies.set(entry.url, bytes);
  }
  const json = (role: string) =>
    JSON.parse(
      bodies
        .get(proof.evidence.find((e) => e.role === role)!.url)!
        .toString("utf8"),
    );
  const rawPbp = json("pbp");
  if (
    rawPbp.id !== id ||
    hash(JSON.stringify(effectivePbp)) !== proof.effectivePbpSha256
  )
    throw new Error("Boundary-shift raw/effective PBP or box identity changed");
  const apiShifts = await cache.derived<unknown[]>(`shifts-${id}`),
    box = await cache.derived<unknown>(`box-${id}`);
  if (
    !apiShifts ||
    !box ||
    hash(JSON.stringify(apiShifts)) !== proof.derivedShiftsSha256 ||
    hash(JSON.stringify(box)) !== proof.derivedBoxSha256
  )
    throw new Error("Boundary-shift derived projection missing/changed");
  let start = 0;
  let shiftExpression: string | null = null;
  const shiftPages = proof.evidence
    .filter((e) => e.role === "shift-page")
    .map((entry) => {
      const parsed = JSON.parse(bodies.get(entry.url)!.toString("utf8"));
      const params = new URL(entry.url).searchParams;
      const expression = params.get("cayenneExp");
      if (
        params.get("start") !== String(start) ||
        (shiftExpression !== null && expression !== shiftExpression) ||
        !Array.isArray(parsed.data)
      )
        throw new Error("Missing/reordered raw shift page");
      shiftExpression = expression;
      start += parsed.data.length;
      return parsed;
    });
  for (const role of ["skater-summary", "goalie-summary"]) {
    const entries = proof.evidence.filter((e) => e.role === role);
    if (entries.length !== 1)
      throw new Error("Ambiguous raw roster projection");
    const page = json(role);
    if (!Array.isArray(page.data) || page.total !== page.data.length)
      throw new Error("Incomplete raw roster projection");
    const official = page.data.filter(
      (r: { gameId: number }) => r.gameId === id,
    );
    const projected: Array<{
      playerId: number;
      toi: string;
      shotsAgainst?: number;
      goalsAgainst?: number;
      side: string;
      group: string;
    }> = [];
    for (const [side, groups] of Object.entries(
      (
        box as {
          playerByGameStats: Record<
            string,
            Record<string, Array<{ playerId: number; toi: string }>>
          >;
        }
      ).playerByGameStats,
    ))
      for (const [group, players] of Object.entries(groups))
        if ((role === "goalie-summary") === (group === "goalies"))
          projected.push(...players.map((p) => ({ ...p, side, group })));
    if (
      !official.length ||
      official.length !== projected.length ||
      new Set(official.map((r: { playerId: number }) => r.playerId)).size !==
        official.length ||
      official.some(
        (r: {
          playerId: number;
          gamesPlayed: number;
          homeRoad: string;
          positionCode: string;
          timeOnIce: number;
          timeOnIcePerGame: number;
          shotsAgainst: number;
          goalsAgainst: number;
        }) => {
          const p = projected.find((p) => p.playerId === r.playerId),
            goalie = role === "goalie-summary";
          return (
            !p ||
            r.gamesPlayed !== 1 ||
            !["H", "R"].includes(r.homeRoad) ||
            p.side !== (r.homeRoad === "H" ? "homeTeam" : "awayTeam") ||
            p.group !==
              (goalie
                ? "goalies"
                : r.positionCode === "D"
                  ? "defense"
                  : "forwards") ||
            clockSeconds(p.toi) !==
              (goalie ? r.timeOnIce : r.timeOnIcePerGame) ||
            (goalie &&
              (p.shotsAgainst !== r.shotsAgainst ||
                p.goalsAgainst !== r.goalsAgainst))
          );
        },
      )
    )
      throw new Error("Official roster/TOI projection changed");
  }
  const schedule = json("schedule"),
    game = effectivePbp as {
      id: number;
      gameDate: string;
      homeTeam: { id: number };
      awayTeam: { id: number };
    };
  if (
    !Array.isArray(schedule.data) ||
    schedule.total !== schedule.data.length ||
    new Set(schedule.data.map((g: { id: number }) => g.id)).size !==
      schedule.total ||
    schedule.data.some(
      (g: { season: number; gameType: number }) =>
        g.season !== season || g.gameType !== 2,
    )
  )
    throw Error("Incomplete boundary schedule");
  const scheduled = schedule.data.filter((g: { id: number }) => g.id === id);
  if (
    scheduled.length !== 1 ||
    scheduled[0].gameStateId !== 7 ||
    scheduled[0].gameDate !== game.gameDate ||
    scheduled[0].homeTeamId !== game.homeTeam.id ||
    scheduled[0].visitingTeamId !== game.awayTeam.id
  )
    throw Error("Boundary schedule identity conflict");
  if (
    !shiftPages.length ||
    shiftPages.some(
      (p) =>
        !Number.isSafeInteger(p.total) ||
        p.total < 0 ||
        p.total !== shiftPages[0].total ||
        !Array.isArray(p.data),
    ) ||
    shiftPages.reduce((n, p) => n + p.data.length, 0) !== shiftPages[0].total
  )
    throw Error("Incomplete boundary API shift pages");
  const originalShiftRows = shiftPages.flatMap((p) => p.data) as Array<{
    id: number;
    gameId: number;
  }>;
  if (
    new Set(originalShiftRows.map((r) => r.id)).size !==
      originalShiftRows.length ||
    originalShiftRows.some(
      (r) =>
        !Number.isSafeInteger(r.id) ||
        !Number.isSafeInteger(r.gameId) ||
        r.gameId === id,
    )
  )
    throw Error("Boundary API alternative cannot be discarded");
  const result = reconcileBoundaryShiftReports(
    effectivePbp,
    box,
    {
      home: bodies.get(exactUrls["home-report"]!)!.toString("utf8"),
      away: bodies.get(exactUrls["away-report"]!)!.toString("utf8"),
    },
    apiShifts,
  );
  if (
    hash(JSON.stringify(result.shifts)) !== proof.recoveredShiftsSha256 ||
    hash(JSON.stringify(result.shiftRecovery)) !== proof.reconciliationSha256
  )
    throw Error("Reviewed boundary reconciliation changed");
  return {
    pbp: effectivePbp,
    box,
    shifts: result.shifts,
    shiftSource: "nhl-toi-report" as const,
    shiftRecovery: result.shiftRecovery,
  };
}

/** Absence retains the original loader behavior; invalid retained proof always throws. */
export async function applyCachedBoundaryShiftProof(
  cache: HockeyDataCache,
  gameId: number,
  effectivePbp: unknown,
) {
  if (!BOUNDARY_SHIFT_GAMES.some((id) => id === gameId)) return undefined;
  const binding = await boundaryShiftParserBinding();
  const proof = await cache.derived<BoundaryShiftProof>(
    boundaryShiftProofKey(
      gameId,
      binding.sha256,
      hash(JSON.stringify(effectivePbp)),
    ),
  );
  return proof
    ? loadReviewedBoundaryShifts(cache, proof, effectivePbp)
    : undefined;
}

/** Explicit reviewed proof only. No source acquisition, inferred reasons, or automatic quarantine. */
export async function collectReviewedBoundaryShiftProof(
  cache: HockeyDataCache,
  proof: BoundaryShiftProof,
  effectivePbp: unknown,
) {
  const sources = await loadReviewedBoundaryShifts(cache, proof, effectivePbp);
  await cache.saveDerived(
    boundaryShiftProofKey(
      proof.gameId,
      proof.parserBindingSha256,
      proof.effectivePbpSha256,
    ),
    proof,
    proof.evidence.map((e) => e.url),
  );
  const readback = await cache.derived<BoundaryShiftProof>(
    boundaryShiftProofKey(
      proof.gameId,
      proof.parserBindingSha256,
      proof.effectivePbpSha256,
    ),
  );
  if (JSON.stringify(readback) !== JSON.stringify(proof))
    throw new Error("Boundary-shift proof readback changed");
  return sources.shiftRecovery;
}

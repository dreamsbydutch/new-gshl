import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { clockSeconds } from "../../domains/nhl/game-value-input";
import { parseOfficialOvertimeEnd } from "../../domains/nhl/official-game-clock";
import type { HockeyDataCache } from "./game-value-source";
import {
  replayUnavailableShiftProof,
  validateUnavailableShiftScope,
  UNAVAILABLE_SHIFT_GAME_IDS,
  type UnavailableShiftProof,
  type UnavailableShiftInputs,
} from "../../domains/nhl/unavailable-shift-proof";

const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const UNAVAILABLE_SHIFT_PARSER_FILES = [
  "scripts/src/domains/nhl/official-shift-report.ts",
  "scripts/src/domains/nhl/game-value-input.ts",
  "scripts/src/domains/nhl/official-game-clock.ts",
  "scripts/src/domains/nhl/unavailable-shift-proof.ts",
  "scripts/src/integrations/nhl/unavailable-shift-source.ts",
] as const;
export async function unavailableShiftParserBinding(root = process.cwd()) {
  const files = await Promise.all(
    UNAVAILABLE_SHIFT_PARSER_FILES.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(root, path))),
    })),
  );
  return { files, sha256: hash(JSON.stringify(files)) };
}
export function unavailableShiftProofKey(
  gameId: number,
  parserBindingSha256: string,
  effectivePbpSha256: string,
) {
  if (
    !/^[a-f0-9]{64}$/.test(parserBindingSha256) ||
    !/^[a-f0-9]{64}$/.test(effectivePbpSha256) ||
    !UNAVAILABLE_SHIFT_GAME_IDS.some((id) => id === gameId)
  )
    throw new Error("Invalid unavailable-shift proof key");
  return `reviewed-unavailable-shifts-${gameId}-${parserBindingSha256}-${effectivePbpSha256}`;
}

/** Read-only replay. Proof creation is a separately reviewed collector action. */
export async function loadReviewedUnavailableShifts(
  cache: HockeyDataCache,
  proof: UnavailableShiftProof,
  effectivePbp: unknown,
) {
  validateUnavailableShiftScope(proof);
  const binding = await unavailableShiftParserBinding();
  if (binding.sha256 !== proof.parserBindingSha256)
    throw new Error(
      "Unavailable-shift parser binding changed; new review required",
    );
  const id = proof.gameId,
    year = Math.floor(id / 1e6),
    season = year * 10001 + 1,
    suffix = String(id % 1e6).padStart(6, "0");
  const exactUrls: Record<string, string> = {
    pbp: `https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`,
    box: `https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`,
    "home-report": `https://www.nhl.com/scores/htmlreports/${season}/TH${suffix}.HTM`,
    "away-report": `https://www.nhl.com/scores/htmlreports/${season}/TV${suffix}.HTM`,
    schedule: `https://api.nhle.com/stats/rest/en/game?cayenneExp=season=${season}%20and%20gameType=2&limit=2000`,
  };
  const needsClock =
    id === 2009020002 &&
    (
      effectivePbp as {
        plays?: Array<{ periodDescriptor?: { number: number } }>;
      }
    ).plays?.some((p) => p.periodDescriptor?.number === 4);
  if (needsClock)
    exactUrls["game-summary"] =
      `https://www.nhl.com/scores/htmlreports/${season}/GS${suffix}.HTM`;
  for (const [role, url] of Object.entries(exactUrls)) {
    const entries = proof.evidence.filter((e) => e.role === role);
    if (entries.length !== 1 || entries[0]!.url !== url)
      throw new Error(`Missing/mixed unavailable-shift ${role} evidence`);
  }
  for (const role of ["shift-page", "skater-summary", "goalie-summary"])
    if (!proof.evidence.some((e) => e.role === role))
      throw new Error(`Missing unavailable-shift ${role} evidence`);
  const bodies = new Map<string, Buffer>();
  let canonicalBatchExpression: string | undefined;
  for (const entry of proof.evidence) {
    if (
      !(entry.role in exactUrls) &&
      !["shift-page", "skater-summary", "goalie-summary"].includes(entry.role)
    )
      throw new Error("Unsupported unavailable-shift evidence role");
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
      throw new Error("Unavailable-shift source bytes changed");
    bodies.set(entry.url, bytes);
  }
  const json = (role: string) =>
    JSON.parse(
      bodies
        .get(proof.evidence.find((e) => e.role === role)!.url)!
        .toString("utf8"),
    );
  const rawPbp = json("pbp"),
    rawBox = json("box");
  if (
    rawPbp.id !== id ||
    rawBox.id !== id ||
    hash(JSON.stringify(effectivePbp)) !== proof.effectivePbpSha256
  )
    throw new Error(
      "Unavailable-shift raw/effective PBP or box identity changed",
    );
  if (needsClock) {
    const officialEnd = parseOfficialOvertimeEnd(
      bodies.get(exactUrls["game-summary"]!)!.toString("utf8"),
      effectivePbp,
    );
    if (
      JSON.stringify(proof.officialPeriodEnds) !== JSON.stringify([officialEnd])
    )
      throw new Error("Official overtime clock proof missing/changed");
  } else if (proof.officialPeriodEnds !== undefined) {
    throw new Error("Unexpected official overtime clock proof");
  }
  const apiShifts = await cache.derived<unknown[]>(`shifts-${id}`),
    box = await cache.derived<unknown>(`box-${id}`);
  if (
    !apiShifts ||
    !box ||
    hash(JSON.stringify(apiShifts)) !== proof.derivedShiftsSha256 ||
    hash(JSON.stringify(box)) !== proof.derivedBoxSha256
  )
    throw new Error("Unavailable-shift derived projection missing/changed");
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
  const inputs: UnavailableShiftInputs = {
    pbp: effectivePbp,
    box,
    apiShifts,
    reports: {
      home: bodies.get(exactUrls["home-report"]!)!.toString("utf8"),
      away: bodies.get(exactUrls["away-report"]!)!.toString("utf8"),
    },
    schedule: json("schedule"),
    shiftPages,
  };
  return replayUnavailableShiftProof(proof, inputs);
}

/** Absence retains the original loader behavior; invalid retained proof always throws. */
export async function applyCachedUnavailableShiftProof(
  cache: HockeyDataCache,
  gameId: number,
  effectivePbp: unknown,
) {
  if (!UNAVAILABLE_SHIFT_GAME_IDS.some((id) => id === gameId)) return undefined;
  const binding = await unavailableShiftParserBinding();
  const proof = await cache.derived<UnavailableShiftProof>(
    unavailableShiftProofKey(
      gameId,
      binding.sha256,
      hash(JSON.stringify(effectivePbp)),
    ),
  );
  return proof
    ? loadReviewedUnavailableShifts(cache, proof, effectivePbp)
    : undefined;
}

/** Explicit reviewed proof only. No source acquisition, inferred reasons, or automatic quarantine. */
export async function collectReviewedUnavailableShiftProof(
  cache: HockeyDataCache,
  proof: UnavailableShiftProof,
  effectivePbp: unknown,
) {
  const sources = await loadReviewedUnavailableShifts(
    cache,
    proof,
    effectivePbp,
  );
  await cache.saveDerived(
    unavailableShiftProofKey(
      proof.gameId,
      proof.parserBindingSha256,
      proof.effectivePbpSha256,
    ),
    proof,
    proof.evidence.map((e) => e.url),
  );
  const readback = await cache.derived<UnavailableShiftProof>(
    unavailableShiftProofKey(
      proof.gameId,
      proof.parserBindingSha256,
      proof.effectivePbpSha256,
    ),
  );
  if (JSON.stringify(readback) !== JSON.stringify(proof))
    throw new Error("Unavailable-shift proof readback changed");
  return sources.shiftAvailability;
}

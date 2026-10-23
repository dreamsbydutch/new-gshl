import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { HockeyDataCache, GameSourceBundle } from "./game-value-source";
import type {
  GameValueData,
  PenaltyEvent,
} from "../../domains/nhl/game-value-input";
import {
  recoverOfficialPenaltyContexts,
  recoverReviewedOvertimeClock,
  isReviewedOvertimeClockGame,
  type OfficialPenaltyContextRecoveryAudit,
  type ReviewedOvertimeClockRecoveryAudit,
} from "../../domains/nhl/official-penalty-context";

const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const digest = (value: unknown) => hash(JSON.stringify(value));
const legalRecovery = (before: number | null, after: number | null) =>
  before !== null ||
  after === null ||
  (Number.isInteger(after) && after >= 3 && after <= 5);
const authorityPaths = [
  "scripts/src/domains/nhl/official-penalty-context.ts",
  "scripts/src/integrations/nhl/official-penalty-context-source.ts",
  "scripts/src/domains/nhl/verified-game-source.ts",
] as const;

export type OfficialPenaltyContextSourceProof = {
  version: "nhl-official-penalty-context-source-v1";
  gameId: number;
  homeTeam: number;
  awayTeam: number;
  sources: {
    rawPbp: { url: string; sha256: string };
    playReport: { url: string; sha256: string };
    effectivePbpSha256: string;
    boxSha256: string;
    shiftsSha256: string;
    baseBundleSha256: string;
  };
  codeHashes: Array<{ path: string; sha256: string }>;
  beforePenalties: PenaltyEvent[];
  afterPenalties: PenaltyEvent[];
  beforePenaltiesSha256: string;
  afterPenaltiesSha256: string;
  audit: OfficialPenaltyContextRecoveryAudit;
  reviewedOvertimeClock?: ReviewedOvertimeClockSourceProof;
};
export type ReviewedOvertimeClockSourceProof = {
  version: "nhl-reviewed-overtime-clock-source-v1";
  gameId: number;
  originalPreClockBundleSha256: string;
  postClockBundleSha256: string;
  officialPeriodEndsBefore: GameSourceBundle["officialPeriodEnds"] | null;
  officialPeriodEndsAfter: NonNullable<GameSourceBundle["officialPeriodEnds"]>;
  sources: {
    rawPbp: { url: string; sha256: string };
    playReport: { url: string; sha256: string };
    homeShiftReport: { url: string; sha256: string };
    awayShiftReport: { url: string; sha256: string };
    effectivePbpSha256: string;
    boxSha256: string;
    shiftsSha256: string;
  };
  codeHashes: Array<{ path: string; sha256: string }>;
  audit: ReviewedOvertimeClockRecoveryAudit;
};
export type PenaltyContextSourceBundle = GameSourceBundle & {
  penaltyContextRecovery?: OfficialPenaltyContextSourceProof;
  reviewedOvertimeClock?: ReviewedOvertimeClockSourceProof;
};

/** Completed shootouts certify elapsed overtime independently of goalie TOI. */
export async function withReviewedOvertimeClock(
  cache: HockeyDataCache,
  gameId: number,
  sources: GameSourceBundle,
): Promise<PenaltyContextSourceBundle> {
  if (!isReviewedOvertimeClockGame(gameId)) return sources;
  if ("reviewedOvertimeClock" in sources || "penaltyContextRecovery" in sources)
    throw Error(
      "Overtime clock must be replayed from the original source bundle",
    );
  const before = JSON.stringify(sources);
  const suffix = String(gameId % 1e6).padStart(6, "0");
  const urls = [
    `https://api-web.nhle.com/v1/gamecenter/${gameId}/play-by-play`,
    ...["PL", "TH", "TV"].map(
      (prefix) =>
        `https://www.nhl.com/scores/htmlreports/20082009/${prefix}${suffix}.HTM`,
    ),
  ];
  const bodies = await Promise.all(urls.map((url) => cache.retainedBytes(url)));
  const recovered = recoverReviewedOvertimeClock(sources, {
    rawPbpJson: bodies[0]!.toString("utf8"),
    playReportHtml: bodies[1]!.toString("utf8"),
    homeShiftReportHtml: bodies[2]!.toString("utf8"),
    awayShiftReportHtml: bodies[3]!.toString("utf8"),
  });
  if (
    JSON.stringify(sources) !== before ||
    (sources.pbp as { id?: number }).id !== gameId
  )
    throw Error("Overtime clock changed sources or game identity differs");
  const updated = {
    ...sources,
    officialPeriodEnds: structuredClone(recovered.officialPeriodEnds),
  };
  const retained = (index: number) => ({
    url: urls[index]!,
    sha256: hash(bodies[index]!),
  });
  const proof: ReviewedOvertimeClockSourceProof = {
    version: "nhl-reviewed-overtime-clock-source-v1",
    gameId,
    originalPreClockBundleSha256: hash(before),
    postClockBundleSha256: digest(updated),
    officialPeriodEndsBefore: sources.officialPeriodEnds
      ? structuredClone(sources.officialPeriodEnds)
      : null,
    officialPeriodEndsAfter: structuredClone(updated.officialPeriodEnds),
    sources: {
      rawPbp: retained(0),
      playReport: retained(1),
      homeShiftReport: retained(2),
      awayShiftReport: retained(3),
      effectivePbpSha256: digest(sources.pbp),
      boxSha256: digest(sources.box),
      shiftsSha256: digest(sources.shifts),
    },
    codeHashes: await Promise.all(
      authorityPaths.map(async (path) => ({
        path,
        sha256: hash(await readFile(path)),
      })),
    ),
    audit: structuredClone(recovered.audit),
  };
  return { ...updated, reviewedOvertimeClock: proof };
}

/** Retained primary reports supply context only after source selection completes.
 * No PBP, shift, ordinary shot, source-selection or scoring policy is changed. */
export async function withOfficialPenaltyContexts(
  cache: HockeyDataCache,
  sources: PenaltyContextSourceBundle,
  game: GameValueData,
): Promise<{ sources: PenaltyContextSourceBundle; game: GameValueData }> {
  if (Math.floor(game.gameId / 10000) !== 200802) return { sources, game };
  if ("penaltyContextRecovery" in sources)
    throw Error(
      "Penalty context must be replayed from the original source bundle",
    );
  const baseBundleText = JSON.stringify(sources),
    gameBeforeText = JSON.stringify(game),
    beforePenalties = structuredClone(game.penalties);
  const suffix = String(game.gameId % 1e6).padStart(6, "0"),
    rawUrl = `https://api-web.nhle.com/v1/gamecenter/${game.gameId}/play-by-play`,
    reportUrl = `https://www.nhl.com/scores/htmlreports/20082009/PL${suffix}.HTM`;
  const [rawBytes, reportBytes, codeHashes] = await Promise.all([
    cache.retainedBytes(rawUrl),
    cache.retainedBytes(reportUrl),
    Promise.all(
      authorityPaths.map(async (path) => ({
        path,
        sha256: hash(await readFile(path)),
      })),
    ),
  ]);
  const native = JSON.parse(rawBytes.toString("utf8")) as {
    id: number;
    gameDate: string;
    homeTeam: { id: number };
    awayTeam: { id: number };
  };
  if (
    native.id !== game.gameId ||
    native.gameDate !== game.date ||
    native.homeTeam.id !== game.homeTeam ||
    native.awayTeam.id !== game.awayTeam
  )
    throw Error("Penalty context raw game identity differs");
  let recovered: ReturnType<typeof recoverOfficialPenaltyContexts>;
  try {
    recovered = recoverOfficialPenaltyContexts(
      { ...sources, game },
      reportBytes.toString("utf8"),
    );
  } catch (error) {
    throw new Error(
      `Penalty context game ${game.gameId}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (
    JSON.stringify(sources) !== baseBundleText ||
    JSON.stringify(game) !== gameBeforeText
  )
    throw Error("Penalty context recovery mutated its source inputs");
  if (recovered.penalties.length !== beforePenalties.length)
    throw Error("Penalty context changed the assessment count");
  for (const [index, before] of beforePenalties.entries()) {
    const after = recovered.penalties[index]!;
    const { homeBefore: oldHome, awayBefore: oldAway, ...oldFacts } = before;
    const { homeBefore: newHome, awayBefore: newAway, ...newFacts } = after;
    if (
      JSON.stringify(oldFacts) !== JSON.stringify(newFacts) ||
      (oldHome !== null && oldHome !== newHome) ||
      (oldAway !== null && oldAway !== newAway) ||
      !legalRecovery(oldHome, newHome) ||
      !legalRecovery(oldAway, newAway)
    )
      throw Error(
        "Penalty recovery changed facts outside missing legal strength context",
      );
  }
  const afterPenalties = structuredClone(recovered.penalties);
  const proof: OfficialPenaltyContextSourceProof = {
    version: "nhl-official-penalty-context-source-v1",
    gameId: game.gameId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    sources: {
      rawPbp: { url: rawUrl, sha256: hash(rawBytes) },
      playReport: { url: reportUrl, sha256: hash(reportBytes) },
      effectivePbpSha256: digest(sources.pbp),
      boxSha256: digest(sources.box),
      shiftsSha256: digest(sources.shifts),
      baseBundleSha256: hash(baseBundleText),
    },
    codeHashes,
    beforePenalties,
    afterPenalties,
    beforePenaltiesSha256: digest(beforePenalties),
    afterPenaltiesSha256: digest(afterPenalties),
    audit: structuredClone(recovered.audit),
    ...(sources.reviewedOvertimeClock
      ? {
          reviewedOvertimeClock: structuredClone(sources.reviewedOvertimeClock),
        }
      : {}),
  };
  return {
    sources: { ...sources, penaltyContextRecovery: proof },
    game: { ...game, penalties: afterPenalties },
  };
}

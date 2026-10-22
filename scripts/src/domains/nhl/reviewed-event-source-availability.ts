import { createHash } from "node:crypto";
import { load } from "cheerio";

const VERSION = "nhl-reviewed-event-source-availability-v1" as const;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid reviewed event-source object");
  return value as Record<string, unknown>;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw Error("Invalid reviewed event-source array");
  return value;
};
const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid reviewed event-source count/identity");
  return value;
};
const zeroClockIds = [
  11033976, 11033977, 11033978, 11033979, 11033980, 11033981, 11033982,
];
const zeroClockShooters = [
  8471498, 8467876, 8459648, 8469598, 8468660, 8470609, 8467881,
];
const specs = [
  {
    gameId: 2008020076,
    date: "2008-10-19",
    home: 16,
    away: 23,
    periods: [1],
    reason: "untrusted-first-period-event-clock",
  },
  {
    gameId: 2008020259,
    date: "2008-11-17",
    home: 10,
    away: 6,
    periods: [1, 2, 3, 4],
    reason: "empty-official-play-report",
  },
  {
    gameId: 2008020409,
    date: "2008-12-10",
    home: 17,
    away: 20,
    periods: [1, 2, 3, 4],
    reason: "empty-official-play-report",
  },
  {
    gameId: 2008021077,
    date: "2009-03-21",
    home: 27,
    away: 23,
    periods: [1, 2, 3, 4],
    reason: "empty-official-play-report",
  },
] as const;
const physicalKinds = new Set([
  "shot-on-goal",
  "goal",
  "missed-shot",
  "failed-shot-attempt",
]);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export type ReviewedEventSourceAvailabilityMetadata = {
  version: typeof VERSION;
  gameId: number;
  date: string;
  reason: string;
  unavailablePeriods: number[];
  withheldNativeEventIds: number[];
  proofSha256: string;
  sourceHashes: {
    rawPbpSha256: string;
    playReportSha256: string;
    gameSummarySha256: string;
    providerArchiveSha256: string;
  };
};
export type ReviewedEventSourceAvailabilityProof = Omit<
  ReviewedEventSourceAvailabilityMetadata,
  "proofSha256"
> & {
  inputPbpSha256: string;
  nativeRosterPlayerIds: number[];
  nativeOrdinaryPhysicalEvents: Array<{
    eventId: number;
    period: number;
    kind: string;
    teamId: number | null;
    shooterId: number | null;
    goalieId: number | null;
  }>;
  nativeOnGoalAttempts: number;
  nativeGoals: number;
  primaryDiagnostics: {
    playReportCells: number;
    gameSummaryCells: number;
    gameSummaryMatchesDate: boolean;
    gameSummaryMatchesGameNumber: boolean;
    printedZeroClockShotOrdinals: number[];
  };
  interpretation: string;
  proofSha256: string;
};
function scope(raw: Record<string, unknown>) {
  const spec = specs.find((s) => s.gameId === raw.id);
  if (
    !spec ||
    raw.gameDate !== spec.date ||
    raw.gameType !== 2 ||
    raw.gameState !== "OFF" ||
    record(raw.homeTeam).id !== spec.home ||
    record(raw.awayTeam).id !== spec.away
  )
    throw Error("Unsupported reviewed event-source scope");
  return spec;
}
function plays(raw: Record<string, unknown>) {
  const values = array(raw.plays).map(record);
  if (
    !values.length ||
    values.length > 2000 ||
    values.some((p) => count(p.eventId) === 0)
  )
    throw Error("Invalid reviewed event-source native population");
  if (new Set(values.map((p) => count(p.eventId))).size !== values.length)
    throw Error("Duplicate reviewed event-source native identity");
  return values;
}
function withheldIds(raw: Record<string, unknown>) {
  const spec = scope(raw),
    source = plays(raw);
  if (spec.gameId === 2008020076) {
    for (let i = 0; i < zeroClockIds.length; i++) {
      const p = source.find((p) => p.eventId === zeroClockIds[i]);
      if (
        !p ||
        p.typeDescKey !== "shot-on-goal" ||
        record(p.periodDescriptor).number !== 1 ||
        record(p.periodDescriptor).periodType !== "REG" ||
        !/^(?:0|00):00$/.test(String(p.timeInPeriod)) ||
        record(p.details).eventOwnerTeamId !== spec.away ||
        record(p.details).shootingPlayerId !== zeroClockShooters[i] ||
        record(p.details).goalieInNetId !== 8469658
      )
        throw Error("Reviewed zero-clock native evidence changed");
    }
    return [...zeroClockIds];
  }
  const ids = source
    .filter(
      (p) =>
        record(p.periodDescriptor).periodType !== "SO" &&
        physicalKinds.has(String(p.typeDescKey)),
    )
    .map((p) => count(p.eventId))
    .sort((a, b) => a - b);
  if (!ids.length) throw Error("Missing reviewed native physical population");
  return ids;
}

/** This constructor proves missing trust, never an alternative event value or
 * clock. The official cohort and independent SOG/SA guards remain mandatory. */
export function proveReviewedEventSourceAvailability(input: {
  rawPbpText: string;
  playReportHtml: string;
  gameSummaryHtml: string;
  providerArchive: { url: string; sha256: string };
}): ReviewedEventSourceAvailabilityProof {
  const raw = record(JSON.parse(input.rawPbpText)),
    spec = scope(raw),
    source = plays(raw);
  if (
    input.providerArchive.url !==
      "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip" ||
    !hash(input.providerArchive.sha256)
  )
    throw Error("Reviewed event-source archive scope differs");
  if (raw.reviewedEventSourceAvailability !== undefined)
    throw Error("Availability constructor requires original native source");
  const roster = array(raw.rosterSpots)
    .map(record)
    .map((p) => count(p.playerId));
  if (
    !roster.length ||
    roster.length > 80 ||
    roster.includes(0) ||
    new Set(roster).size !== roster.length
  )
    throw Error("Invalid reviewed native roster population");
  const pl = load(input.playReportHtml),
    gs = load(input.gameSummaryHtml),
    cells = (q: ReturnType<typeof load>) =>
      q("td")
        .toArray()
        .map((td) => q(td).text().replace(/\s+/g, " ").trim()),
    plCells = cells(pl),
    gsCells = cells(gs);
  if (
    pl("title").text().trim() !== "Play By Play" ||
    gs("title").text().trim() !== "Game Summary"
  )
    throw Error("Wrong reviewed event-source report kind");
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(spec.date + "T00:00:00Z"));
  const gameNumber = (values: string[]) =>
    values.some((v) =>
      new RegExp(`^(?:Match/)?Game\\s+0*${spec.gameId % 10000}$`).test(v),
    );
  const zeroRows: number[] = [];
  if (spec.reason === "empty-official-play-report") {
    if (plCells.length !== 0)
      throw Error("Reviewed unavailable play report is no longer empty");
  } else {
    if (!plCells.includes(date) || !gameNumber(plCells))
      throw Error("Wrong reviewed zero-clock primary report scope");
    for (const tr of pl("tr").toArray()) {
      const row = pl(tr)
        .children("td")
        .toArray()
        .map((td) => pl(td).text().replace(/\s+/g, " ").trim());
      if (
        row.length === 8 &&
        row[1] === "1" &&
        row[4] === "SHOT" &&
        /^0:00/.test(row[3]!) &&
        row[5]!.startsWith("VAN ONGOAL -") &&
        row[6] === ""
      )
        zeroRows.push(Number(row[0]));
    }
    if (!same(zeroRows, [2, 3, 6, 11, 13]))
      throw Error("Reviewed primary zero-clock/absent-lineup evidence changed");
  }
  const nativeOrdinaryPhysicalEvents = source
    .filter(
      (p) =>
        record(p.periodDescriptor).periodType !== "SO" &&
        physicalKinds.has(String(p.typeDescKey)),
    )
    .map((p) => {
      const d = p.details === undefined ? {} : record(p.details);
      const identity = (v: unknown) =>
        v === undefined || v === null ? null : count(v);
      return {
        eventId: count(p.eventId),
        period: count(record(p.periodDescriptor).number),
        kind: String(p.typeDescKey),
        teamId: identity(d.eventOwnerTeamId),
        shooterId: identity(d.shootingPlayerId ?? d.scoringPlayerId),
        goalieId: identity(d.goalieInNetId),
      };
    });
  if (nativeOrdinaryPhysicalEvents.some((p) => p.period < 1 || p.period > 4))
    throw Error("Invalid reviewed ordinary native period");
  const body = {
    version: VERSION,
    gameId: spec.gameId,
    date: spec.date,
    reason: spec.reason,
    unavailablePeriods: [...spec.periods],
    withheldNativeEventIds: withheldIds(raw),
    sourceHashes: {
      rawPbpSha256: sha(input.rawPbpText),
      playReportSha256: sha(input.playReportHtml),
      gameSummarySha256: sha(input.gameSummaryHtml),
      providerArchiveSha256: input.providerArchive.sha256,
    },
    inputPbpSha256: sha(JSON.stringify(raw)),
    nativeRosterPlayerIds: roster,
    nativeOrdinaryPhysicalEvents,
    nativeOnGoalAttempts: nativeOrdinaryPhysicalEvents.filter(
      (p) => p.kind === "shot-on-goal" || p.kind === "goal",
    ).length,
    nativeGoals: nativeOrdinaryPhysicalEvents.filter((p) => p.kind === "goal")
      .length,
    primaryDiagnostics: {
      playReportCells: plCells.length,
      gameSummaryCells: gsCells.length,
      gameSummaryMatchesDate: gsCells.includes(date),
      gameSummaryMatchesGameNumber: gameNumber(gsCells),
      printedZeroClockShotOrdinals: zeroRows,
    },
    interpretation:
      "Reviewed event-source availability only. Native roster, events, SOG/GOAL exposure, GP, TOI and known PIM remain unchanged. Listed periods cannot supply individual value, training rows or process value. No replacement clock, geometry, zero probability or shift-unavailability claim. GS identity/completeness diagnostics do not authorize its use as event data.",
  };
  return { ...body, proofSha256: sha(JSON.stringify(body)) };
}

/** IO must separately replay the full cache proof and its actual source bytes.
 * This pure accessor validates the narrow metadata contract at every scorer. */
export function reviewedEventSourcePeriods(
  rawPbp: unknown,
): ReadonlySet<number> {
  const raw = record(rawPbp),
    value = raw.reviewedEventSourceAvailability;
  if (value === undefined) return new Set();
  const metadata = record(value),
    spec = scope(raw),
    hashes = record(metadata.sourceHashes);
  if (
    metadata.version !== VERSION ||
    metadata.gameId !== spec.gameId ||
    metadata.date !== spec.date ||
    metadata.reason !== spec.reason ||
    !hash(metadata.proofSha256) ||
    !same(metadata.unavailablePeriods, [...spec.periods]) ||
    !same(metadata.withheldNativeEventIds, withheldIds(raw)) ||
    Object.keys(hashes).length !== 4 ||
    ![
      "rawPbpSha256",
      "playReportSha256",
      "gameSummarySha256",
      "providerArchiveSha256",
    ].every((k) => hash(hashes[k]))
  )
    throw Error("Invalid reviewed event-source availability metadata");
  return new Set(spec.periods);
}

export function applyReviewedEventSourceAvailability<T>(
  rawPbp: T,
  proof: ReviewedEventSourceAvailabilityProof,
): T {
  const raw = record(rawPbp),
    base = { ...raw };
  delete base.reviewedEventSourceAvailability;
  const { proofSha256, ...body } = proof;
  if (
    !hash(proofSha256) ||
    sha(JSON.stringify(body)) !== proofSha256 ||
    sha(JSON.stringify(base)) !== proof.inputPbpSha256
  )
    throw Error("Reviewed event-source proof/input changed");
  const metadata: ReviewedEventSourceAvailabilityMetadata = {
    version: proof.version,
    gameId: proof.gameId,
    date: proof.date,
    reason: proof.reason,
    unavailablePeriods: [...proof.unavailablePeriods],
    withheldNativeEventIds: [...proof.withheldNativeEventIds],
    proofSha256,
    sourceHashes: { ...proof.sourceHashes },
  };
  if (
    raw.reviewedEventSourceAvailability !== undefined &&
    !same(raw.reviewedEventSourceAvailability, metadata)
  )
    throw Error("Conflicting reviewed event-source metadata");
  const result = {
    ...structuredClone(raw),
    reviewedEventSourceAvailability: metadata,
  };
  reviewedEventSourcePeriods(result);
  return result as T;
}

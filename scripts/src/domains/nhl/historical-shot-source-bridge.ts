import { alignHistoricalShotTypes } from "./historical-shot-type-alignment";
import { createHash } from "node:crypto";
import {
  verifyPairedPsSource,
  type PairedPsSourceInput,
} from "./reviewed-paired-penalty-shot-source";
import { verifyGs0868Supplement } from "./reviewed-gs-penalty-source";
import { verify1114ReportOnlyPsAward } from "./reviewed-report-only-penalty-shot-award";
import { load } from "cheerio";
import { parseCsv } from "../ranking/nhl-rating-diagnostics";
import { clockSeconds } from "./game-value-input";
import { reviewedEventSourcePeriods } from "./reviewed-event-source-availability";
import {
  alignHistoricalPenaltyGroup,
  reviewModelEquivalentPenaltyGroup,
  reviewPartitionedHistoricalPenaltyGroup,
  type HistoricalReportPenaltyIdentity,
} from "./historical-penalty-alignment";

export interface HistoricalRawShot {
  gameId: number;
  ordinal: number;
  period: number;
  second: number;
  kind: "SHOT" | "MISS" | "GOAL";
  shooter: number;
  goalie: number;
  home: boolean;
  x: number;
  y: number;
  homeSkaters: number;
  awaySkaters: number;
  homeGoalie: boolean;
  awayGoalie: boolean;
  shotType: string;
}
export interface HistoricalShotProvenance {
  providerUrl: string;
  providerSha256: string;
  officialPlayReportUrl: string;
  officialPlayReportSha256: string;
  officialPbpSha256: string;
}
/** Full source inputs are replayed, never caller-supplied identity assignments. */
export interface HistoricalShotSupplementalSources {
  pairedPenaltyShot?: PairedPsSourceInput;
  supplementalPenalty?: Parameters<typeof verifyGs0868Supplement>[0];
  reportOnlyPenaltyShotAward?: Parameters<
    typeof verify1114ReportOnlyPsAward
  >[0];
}
const numeric = (v: unknown) => {
  if (v === "" || v === null || v === undefined)
    throw Error("Missing historical raw shot field");
  const n = Number(v);
  if (!Number.isFinite(n)) throw Error("Invalid historical raw shot number");
  return n;
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const teamCode = (s: string) =>
  ({ TB: "TBL", SJ: "SJS", LA: "LAK", NJ: "NJD" })[normalize(s)] ??
  normalize(s);
const kindMap: Record<string, string> = {
  SHOT: "shot-on-goal",
  GOAL: "goal",
  MISS: "missed-shot",
  FAC: "faceoff",
  BLOCK: "blocked-shot",
  HIT: "hit",
  GIVE: "giveaway",
  TAKE: "takeaway",
  PENL: "penalty",
  STOP: "stoppage",
  PSTR: "period-start",
  PEND: "period-end",
  GEND: "game-end",
  CHL: "challenge",
};

/** Read only observed source fields. Provider probabilities, adjusted geometry,
 * rebound/rush labels and post-shot results are deliberately never consulted. */
export function parseHistoricalRawShots(csv: string, season: number) {
  const lines = csv.split(/\r?\n/),
    header = lines.shift()!;
  const year = Math.floor(season / 10000),
    games = new Map<number, HistoricalRawShot[]>(),
    seen = new Set<string>();
  const rejected: Array<{ gameId: number; ordinal: number; reason: string }> =
    [];
  if (year + 1 !== season % 10000)
    throw Error("Invalid historical shot season");
  for (let start = 0; start < lines.length; start += 1000)
    for (const r of parseCsv(
      header + "\n" + lines.slice(start, start + 1000).join("\n"),
    )) {
      if (numeric(r.season) !== year)
        throw Error("Mixed historical raw shot seasons");
      const suffix = numeric(r.game_id),
        gameId = suffix > 1e9 ? suffix : year * 1e6 + suffix;
      if (Math.floor(gameId / 10000) % 100 !== 2) continue;
      const period = numeric(r.period),
        second = numeric(r.time) - (period - 1) * 1200;
      if (Number.isInteger(period) && period > 4) {
        rejected.push({
          gameId,
          ordinal: numeric(r.id),
          reason: "Intentional regular-season shootout exclusion",
        });
        continue;
      }
      const binary = (v: unknown) => {
        const n = numeric(v);
        if (n !== 0 && n !== 1)
          throw Error("Invalid historical binary shot field");
        return n === 1;
      };
      const row: HistoricalRawShot = {
        gameId,
        ordinal: numeric(r.id),
        period,
        second,
        kind: String(r.event) as HistoricalRawShot["kind"],
        shooter: numeric(r.shooterPlayerId),
        goalie: numeric(r.goalieIdForShot),
        home: binary(r.isHomeTeam),
        x: numeric(r.xCord),
        y: numeric(r.yCord),
        homeSkaters: numeric(r.homeSkatersOnIce),
        awaySkaters: numeric(r.awaySkatersOnIce),
        homeGoalie: !binary(r.homeEmptyNet),
        awayGoalie: !binary(r.awayEmptyNet),
        shotType: String(r.shotType)
          .toLowerCase()
          .replace(/^tip$/, "tip-in")
          .replace(/^wrap$/, "wrap-around"),
      };
      if (
        !Number.isSafeInteger(gameId) ||
        Math.floor(gameId / 1e6) !== year ||
        !Number.isInteger(period) ||
        period < 1 ||
        !Number.isInteger(second) ||
        second < 0 ||
        second > 1200 ||
        !Number.isInteger(row.ordinal) ||
        row.ordinal < 1 ||
        !["SHOT", "MISS", "GOAL"].includes(row.kind) ||
        !Number.isInteger(row.shooter) ||
        row.shooter < 1 ||
        !Number.isInteger(row.goalie) ||
        row.goalie < 0 ||
        Math.abs(row.x) > 100 ||
        Math.abs(row.y) > 43 ||
        ![row.homeSkaters, row.awaySkaters].every(
          (n) => Number.isInteger(n) && n >= 1 && n <= 6,
        )
      ) {
        rejected.push({
          gameId,
          ordinal: row.ordinal,
          reason: "Invalid historical raw shot identity/geometry",
        });
        continue;
      }
      const key = `${gameId}:${row.ordinal}`;
      // Retain both candidates so a downstream ordinal join cannot silently
      // select the first duplicate. Its official event will remain unpriced.
      if (seen.has(key))
        rejected.push({
          gameId,
          ordinal: row.ordinal,
          reason:
            "Duplicate historical raw shot ordinal; all candidates remain ambiguous",
        });
      seen.add(key);
      const list = games.get(gameId) ?? [];
      list.push(row);
      games.set(gameId, list);
    }
  return { games, rejected };
}

type Roster = {
  playerId: number;
  teamId: number;
  sweaterNumber: number;
  positionCode: string;
  firstName?: { default: string };
  lastName: { default: string };
};

/** Exact NHL-ID historical surname, corroborated by official RO and landing.
 * Team/jersey and unique roster join remain mandatory at every call site. */
function reportSurnameMatches(player: Roster, report: string): boolean {
  return (
    normalize(player.lastName.default) === normalize(report) ||
    (player.playerId === 8471269 &&
      normalize(player.firstName?.default ?? "") === "NICKLAS" &&
      normalize(player.lastName.default) === "GROSSMANN" &&
      normalize(report) === "GROSSMAN")
  );
}

type Play = {
  eventId: number;
  sortOrder: number;
  periodDescriptor: { number: number; periodType: string };
  timeInPeriod: string;
  typeDescKey: string;
  situationCode?: string;
  details?: Record<string, unknown>;
  [k: string]: unknown;
};
type Pbp = {
  id: number;
  gameDate: string;
  homeTeam: { id: number; abbrev: string };
  awayTeam: { id: number; abbrev: string };
  rosterSpots: Roster[];
  plays: Play[];
  [k: string]: unknown;
};
type ReportEvent = {
  ordinal: number;
  period: number;
  second: number;
  kind: string;
  team?: number;
  shooter?: number;
  committed?: number;
  benchServed?: number;
  benchDuration?: number;
  invalidBenchActor?: boolean;
  invalidPenaltyActor?: boolean;
  shooterAbsentFromReportLineup?: boolean;
  goalie?: number;
  situation?: string;
  zone?: string;
  description: string;
  penaltyIdentity?: HistoricalReportPenaltyIdentity & {
    semantics: Record<string, unknown>;
  };
};

/** Independent official event ordinal, clock, team/jersey/name and on-ice roster
 * checks precede any provider enrichment. Unknown/ambiguous records are withheld. */
export function bridgeHistoricalShotSource(
  raw: unknown,
  rows: readonly HistoricalRawShot[],
  html: string,
  provenance: HistoricalShotProvenance,
  supplemental?: HistoricalShotSupplementalSources,
) {
  const game = raw as Pbp;
  const unavailablePeriods = reviewedEventSourcePeriods(raw);
  const retainedUnknownClockIds =
    unavailablePeriods.size && game.id === 2008020076
      ? [11033976, 11033977, 11033978, 11033979, 11033980, 11033981, 11033982]
      : [];
  const retainedUnknownClockOrdinals = retainedUnknownClockIds.length
    ? [24, 26, 2, 3, 6, 11, 13]
    : [];
  if (
    !Number.isSafeInteger(game.id) ||
    !Array.isArray(game.plays) ||
    !Array.isArray(game.rosterSpots)
  )
    throw Error("Invalid historical official game");
  const season = Math.floor(game.id / 1e6) * 10001 + 1;
  const expectedUrl = `https://www.nhl.com/scores/htmlreports/${season}/PL${String(game.id % 1e6).padStart(6, "0")}.HTM`;
  if (
    provenance.officialPlayReportUrl !== expectedUrl ||
    provenance.providerUrl !==
      `https://peter-tanner.com/moneypuck/downloads/shots_${Math.floor(game.id / 1e6)}.zip` ||
    ![
      provenance.providerSha256,
      provenance.officialPlayReportSha256,
      provenance.officialPbpSha256,
    ].every((s) => /^[a-f0-9]{64}$/.test(s))
  )
    throw Error("Historical bridge provenance/scope mismatch");
  const assertOwnSources = (input: {
    rawPbpText: string;
    primaryHtml: string;
  }) => {
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    if (
      sha(input.rawPbpText) !== provenance.officialPbpSha256 ||
      sha(input.primaryHtml) !== provenance.officialPlayReportSha256 ||
      input.primaryHtml !== html ||
      JSON.stringify(JSON.parse(input.rawPbpText)) !== JSON.stringify(game)
    )
      throw Error(
        "Supplemental source bytes differ from historical bridge input",
      );
  };
  if (supplemental?.pairedPenaltyShot)
    assertOwnSources(supplemental.pairedPenaltyShot);
  if (supplemental?.supplementalPenalty)
    assertOwnSources(supplemental.supplementalPenalty);
  if (supplemental?.reportOnlyPenaltyShotAward)
    assertOwnSources(supplemental.reportOnlyPenaltyShotAward);
  const pairedProof = supplemental?.pairedPenaltyShot
    ? verifyPairedPsSource(supplemental.pairedPenaltyShot)
    : undefined;
  const gsProof = supplemental?.supplementalPenalty
    ? verifyGs0868Supplement(supplemental.supplementalPenalty)
    : undefined;
  const awardProof = supplemental?.reportOnlyPenaltyShotAward
    ? verify1114ReportOnlyPsAward(supplemental.reportOnlyPenaltyShotAward)
    : undefined;
  const pairedSlots = pairedProof
    ? pairedProof.assignments.length
      ? pairedProof.assignments
      : pairedProof.unresolvedBijections[0]!
    : [];
  const pairedByOrdinal = new Map(pairedSlots.map((p) => [p.ordinal, p]));
  const page = load(html),
    cells = page("td")
      .toArray()
      .map((td) => page(td).text().replace(/\s+/g, " ").trim());
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(game.gameDate + "T00:00:00Z"));
  if (
    !/^Play By Play$/i.test(page("title").text().trim()) ||
    !cells.includes(date) ||
    !cells.some((s) => {
      const m = s.match(/^(?:Match\/)?Game\s+(\d+)$/);
      return m && Number(m[1]) === game.id % 10000;
    })
  )
    throw Error("Wrong historical official play report scope");
  const report: ReportEvent[] = [],
    ignoredShootoutReportEvents: Array<{
      ordinal: number;
      period: number;
      second: number;
      kind: string;
      description: string;
    }> = [],
    ordinals = new Set<number>();
  const team = (code: string) =>
    teamCode(code) === teamCode(game.homeTeam.abbrev)
      ? game.homeTeam.id
      : teamCode(code) === teamCode(game.awayTeam.abbrev)
        ? game.awayTeam.id
        : undefined;
  function lineup(text: string, teamId: number) {
    const tokens = [...text.matchAll(/\b(\d{1,2})\s+([CDLRWG]{1,2})\b/g)];
    if (!tokens.length) return null;
    const ids = new Set<number>();
    let goalie: number | undefined,
      skaters = 0;
    for (const token of tokens) {
      const found = game.rosterSpots.filter(
        (p) => p.teamId === teamId && p.sweaterNumber === Number(token[1]),
      );
      if (
        found.length !== 1 ||
        ids.has(found[0]!.playerId) ||
        (token[2] === "G") !== (found[0]!.positionCode === "G")
      )
        return null;
      ids.add(found[0]!.playerId);
      if (token[2] === "G") {
        if (goalie !== undefined) return null;
        goalie = found[0]!.playerId;
      } else skaters++;
    }
    return { goalie, skaters, ids };
  }
  page("tr").each((_, tr) => {
    const columns = page(tr).children("td");
    if (columns.length !== 8) return;
    const text = columns
      .toArray()
      .map((c) => page(c).text().replace(/\s+/g, " ").trim());
    const ordinal = Number(text[0]),
      period = Number(text[1]);
    if (
      !Number.isInteger(ordinal) ||
      ordinal < 1 ||
      !Number.isInteger(period) ||
      period < 1
    )
      return;
    const clock = text[3]!.match(/^(\d+:\d{2})/);
    if (!clock) return;
    const second = clockSeconds(clock[1]),
      kind =
        kindMap[text[4]!] ??
        (/^[A-Z]{2,8}$/.test(text[4]!)
          ? `nhl-report-${text[4]!.toLowerCase()}`
          : undefined);
    if (!kind || ordinals.has(ordinal))
      throw Error("Unknown/duplicate historical official report event");
    ordinals.add(ordinal);
    const description = text[5]!,
      owner = team(description.split(" ")[0]!);
    if (Math.floor(game.id / 10000) % 100 === 2 && period > 4) {
      ignoredShootoutReportEvents.push({
        ordinal,
        period,
        second,
        kind,
        description,
      });
      return;
    }
    const event: ReportEvent = {
      ordinal,
      period,
      second,
      kind,
      team: owner,
      description,
    };
    if (kind === "penalty") {
      const bench =
        /^\S+\s+TEAM\s+.*\bbench\b/i.test(description) ||
        /^\S+\s+TEAM\s+Face-off violation\(2\s+min\)\s+Served By:/i.test(
          description,
        );
      if (bench) {
        const served = description.match(
          /Served By:\s*#(\d+)\s+([^,]+?)(?=\s+Drawn By:|,|$)/i,
        );
        const actors = served
          ? game.rosterSpots.filter(
              (p) =>
                p.teamId === owner &&
                p.positionCode !== "G" &&
                p.sweaterNumber === Number(served[1]) &&
                reportSurnameMatches(p, served[2]!),
            )
          : [];
        const duration = description.match(/\((\d+) min\)/);
        if (actors.length === 1 && duration) {
          event.benchServed = actors[0]!.playerId;
          event.benchDuration = Number(duration[1]);
        } else event.invalidBenchActor = true;
      } else {
        const match = description.match(
          /#(\d+)\s+([^,]+?)(?=\s+(?:Holding|Hooking|Tripping|Interference|Roughing|Slashing|Boarding|Cross|Hi|High|Delay|Delaying|Unsportsmanlike|Fighting|Elbowing|Charging|Too|Abuse)|,|$)/i,
        );
        const actors = match
          ? game.rosterSpots.filter(
              (p) =>
                p.teamId === owner &&
                p.sweaterNumber === Number(match[1]) &&
                reportSurnameMatches(p, match[2]!),
            )
          : [];
        if (actors.length === 1) event.committed = actors[0]!.playerId;
      }
      // Only fully roster-verified offence text can disambiguate repeated
      // same-clock penalties. Unsupported labels retain the strict old path.
      const actor = game.rosterSpots.find(
        (p) => p.playerId === event.committed && p.teamId === owner,
      );
      const printed = description.match(/^\S+\s+#\d+\s+(.+?)\((\d+)\s+min\)/i);
      const candidateJersey = description.match(/^\S+\s+#(\d+)\s/);
      const fallbackActors =
        !actor && printed && candidateJersey
          ? game.rosterSpots.filter(
              (p) =>
                p.teamId === owner &&
                p.sweaterNumber === Number(candidateJersey[1]) &&
                printed[1]!
                  .trim()
                  .split(/\s+/)
                  .some((_, i, words) =>
                    reportSurnameMatches(p, words.slice(0, i + 1).join(" ")),
                  ),
            )
          : [];
      const penaltyActor =
        actor ?? (fallbackActors.length === 1 ? fallbackActors[0] : undefined);
      if (penaltyActor && printed && owner !== undefined) {
        event.committed = penaltyActor.playerId;
        const prefix = printed[1]!.trim();
        // Compare the complete name prefix, preserving offence word boundaries.
        const words = prefix.split(/\s+/);
        let nameWords = 0;
        for (let i = 1; i <= words.length; i++)
          if (reportSurnameMatches(penaltyActor, words.slice(0, i).join(" ")))
            nameWords = i;
        const offence = words.slice(nameWords).join(" ");
        const duration = Number(printed[2]);
        const typeCode = /\(maj\)\s*$/i.test(offence)
          ? "MAJ"
          : /^Match penalty$/i.test(offence) && duration === 10
            ? "MAT"
            : /^Game Misconduct$/i.test(offence)
              ? "GAM"
              : /^(?:Misconduct|Instigator\s*-\s*Misconduct)$/i.test(offence)
                ? "MIS"
                : /^Aggressor$/i.test(offence) && duration === 10
                  ? "GAM"
                  : duration === 2 || duration === 4
                    ? "MIN"
                    : undefined;
        const served = description.match(
          /Served By:\s*#(\d+)\s+([^,]+?)(?=\s+Drawn By:|,|$)/i,
        );
        const servers = served
          ? game.rosterSpots.filter(
              (p) =>
                p.teamId === owner &&
                p.positionCode !== "G" &&
                p.sweaterNumber === Number(served[1]) &&
                reportSurnameMatches(p, served[2]!),
            )
          : [];
        if (nameWords && typeCode && (!served || servers.length === 1))
          event.penaltyIdentity = {
            ordinal,
            period,
            second,
            teamId: owner,
            committedByPlayerId: penaltyActor.playerId,
            ...(served ? { servedByPlayerId: servers[0]!.playerId } : {}),
            duration,
            typeCode,
            offence: offence.replace(/\s*\(maj\)\s*$/i, ""),
            semantics: {
              description,
              strength: text[2],
              awayLineup: text[6],
              homeLineup: text[7],
            },
          };
      }
      if (!bench && candidateJersey && event.committed === undefined)
        event.invalidPenaltyActor = true;
    }
    if (gsProof && ordinal === gsProof.supplementalPenalty.ordinal) {
      const supplied = gsProof.supplementalPenalty;
      event.committed = supplied.committedByPlayerId;
      event.penaltyIdentity = {
        ...supplied,
        semantics: {
          description,
          strength: text[2],
          awayLineup: text[6],
          homeLineup: text[7],
          supplementalSummarySha256: gsProof.sourceHashes.summarySha256,
        },
      };
      delete event.invalidPenaltyActor;
    }
    const zone = description.match(/\b(Off|Def|Neu)\. Zone\b/);
    if (zone) event.zone = { Off: "O", Def: "D", Neu: "N" }[zone[1]!];
    if (["shot-on-goal", "goal", "missed-shot"].includes(kind)) {
      const match = description.match(/#(\d+)\s+([^,]+)/),
        away = lineup(text[6]!, game.awayTeam.id),
        home = lineup(text[7]!, game.homeTeam.id);
      const shooter = match
        ? game.rosterSpots.filter(
            (p) =>
              p.teamId === owner &&
              p.sweaterNumber === Number(match[1]) &&
              reportSurnameMatches(p, match[2]!.replace(/\([^)]*\)/g, "")),
          )
        : [];
      if (owner !== undefined && shooter.length === 1 && away && home) {
        event.shooter = shooter[0]!.playerId;
        event.shooterAbsentFromReportLineup = !(
          owner === game.homeTeam.id ? home : away
        ).ids.has(shooter[0]!.playerId);
        event.goalie = (owner === game.homeTeam.id ? away : home).goalie ?? 0;
        event.situation = `${away.goalie ? 1 : 0}${away.skaters}${home.skaters}${home.goalie ? 1 : 0}`;
      }
    }
    report.push(event);
  });
  if (!report.length) throw Error("Missing historical official event rows");
  const regularPlays = game.plays.filter(
    (p) => p.periodDescriptor.periodType !== "SO",
  );
  const sparse = regularPlays.every((p) =>
    ["shot-on-goal", "goal", "penalty"].includes(p.typeDescKey),
  );
  const penaltyAssignments = new Map<number, number>();
  const penaltyAlignments: unknown[] = [];
  const visitedPenaltyGroups = new Set<string>();
  for (const event of report) {
    if (!event.penaltyIdentity) continue;
    const identity = event.penaltyIdentity;
    const key = `${event.period}:${event.second}:${event.team}:${event.committed}`;
    if (visitedPenaltyGroups.has(key)) continue;
    visitedPenaltyGroups.add(key);
    const nativeGroup = regularPlays.filter(
      (p) =>
        p.typeDescKey === "penalty" &&
        p.periodDescriptor.number === event.period &&
        clockSeconds(p.timeInPeriod) === event.second &&
        p.details?.eventOwnerTeamId === event.team &&
        p.details?.committedByPlayerId === event.committed,
    );
    if (nativeGroup.length < 2) continue;
    const reportGroup = report.filter(
      (r) =>
        r.kind === "penalty" &&
        r.ordinal !== awardProof?.reportOnlyAward.ordinal &&
        r.period === event.period &&
        r.second === event.second &&
        r.team === event.team &&
        r.committed === event.committed,
    );
    if (reportGroup.some((r) => !r.penaltyIdentity)) continue;
    const official = reportGroup.map((r) => r.penaltyIdentity!);
    const native = nativeGroup.map((p) => ({
      eventId: p.eventId,
      sortOrder: p.sortOrder,
      period: p.periodDescriptor.number,
      second: clockSeconds(p.timeInPeriod),
      teamId: p.details?.eventOwnerTeamId as number,
      committedByPlayerId: p.details?.committedByPlayerId as number,
      ...(p.details?.servedByPlayerId === undefined
        ? {}
        : { servedByPlayerId: p.details.servedByPlayerId as number | null }),
      duration: p.details?.duration as number,
      typeCode: p.details?.typeCode as string,
      offence: p.details?.descKey as string,
    }));
    const alignment = alignHistoricalPenaltyGroup(native, official);
    if (alignment.status === "unique") {
      for (const match of alignment.matches)
        penaltyAssignments.set(match.ordinal, match.eventId);
      penaltyAlignments.push({
        status: alignment.status,
        ...identity,
        alignment,
      });
    } else if (alignment.status === "ambiguous") {
      const equivalent = reviewModelEquivalentPenaltyGroup(
        nativeGroup,
        official,
      );
      if (equivalent.accepted) {
        for (const slot of equivalent.ordinalSlots)
          penaltyAssignments.set(slot.reportOrdinal, slot.nativeEventId);
        penaltyAlignments.push(equivalent);
      } else {
        const partitioned = reviewPartitionedHistoricalPenaltyGroup(
          nativeGroup,
          official,
        );
        if (partitioned.accepted) {
          for (const slot of partitioned.ordinalSlots)
            penaltyAssignments.set(slot.reportOrdinal, slot.nativeEventId);
          penaltyAlignments.push(partitioned);
        }
      }
    }
  }
  // Explicitly reviewed full-payload equivalence is identity uncertainty, not
  // a unique primary ID match. Every assignment is numerically invariant.
  const reviewedEquivalentCases: Record<
    number,
    Array<{
      ids: number[];
      ordinals: number[];
      legacy: boolean;
      nativeContext?: unknown[];
      primaryContext?: Array<{
        ordinal: number;
        period: number;
        second: number;
        kind: string;
        description: string;
      }>;
    }>
  > = {
    "2008020038": [
      {
        ids: [11031786, 11031787],
        ordinals: [49, 51],
        legacy: true,
      },
    ],
    "2008020072": [
      {
        ids: [11033784, 11033785],
        ordinals: [234, 235],
        legacy: true,
      },
    ],
    "2008020115": [
      {
        ids: [11036400, 11036401],
        ordinals: [41, 42],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020121": [
      {
        ids: [11036770, 11036771],
        ordinals: [59, 60],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020130": [
      {
        ids: [11037321, 11037322],
        ordinals: [143, 144],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020222": [
      {
        ids: [11042910, 11042911],
        ordinals: [237, 238],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020257": [
      {
        ids: [11044973, 11044974],
        ordinals: [208, 209],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020260": [
      {
        ids: [11045121, 11045123],
        ordinals: [44, 47],
        legacy: false,
        nativeContext: [
          {
            eventId: 11045122,
            periodDescriptor: {
              number: 1,
              periodType: "REG",
              maxRegulationPeriods: 3,
            },
            timeInPeriod: "07:45",
            timeRemaining: "12:15",
            typeCode: 506,
            typeDescKey: "shot-on-goal",
            sortOrder: 16,
            details: {
              shotType: "wrist",
              shootingPlayerId: 8471309,
              goalieInNetId: 8460806,
              eventOwnerTeamId: 17,
              awaySOG: 1,
              homeSOG: 12,
            },
          },
        ],
        primaryContext: [
          {
            ordinal: 45,
            period: 1,
            second: 465,
            kind: "stoppage",
            description: "GOALIE STOPPED,TV TIMEOUT",
          },
          {
            ordinal: 46,
            period: 1,
            second: 465,
            kind: "shot-on-goal",
            description: "DET ONGOAL - #93 FRANZEN, Wrist, Off. Zone, 10 ft.",
          },
        ],
      },
    ],
    "2008020304": [
      {
        ids: [11047822, 11047823],
        ordinals: [290, 291],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020332": [
      {
        ids: [11049490, 11049491],
        ordinals: [221, 222],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020499": [
      {
        ids: [11059374, 11059375, 11059376],
        ordinals: [114, 115, 116],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020502": [
      {
        ids: [11059564, 11059565],
        ordinals: [138, 139],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020590": [
      {
        ids: [11064877, 11064878],
        ordinals: [19, 20],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020634": [
      {
        ids: [11067516, 11067517],
        ordinals: [33, 35],
        legacy: false,
        nativeContext: [],
        primaryContext: [
          {
            ordinal: 34,
            period: 1,
            second: 299,
            kind: "stoppage",
            description: "GOALIE STOPPED",
          },
        ],
      },
    ],
    "2008020715": [
      {
        ids: [11072392, 11072393],
        ordinals: [158, 160],
        legacy: false,
        nativeContext: [],
        primaryContext: [
          {
            ordinal: 159,
            period: 2,
            second: 675,
            kind: "stoppage",
            description: "GOALIE STOPPED",
          },
        ],
      },
    ],
    "2008020751": [
      {
        ids: [11074549, 11074550],
        ordinals: [66, 67],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020769": [
      {
        ids: [11075627, 11075628],
        ordinals: [251, 252],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020834": [
      {
        ids: [11079608, 11079609],
        ordinals: [131, 133],
        legacy: false,
        nativeContext: [],
        primaryContext: [
          {
            ordinal: 132,
            period: 2,
            second: 824,
            kind: "stoppage",
            description: "GOALIE STOPPED",
          },
        ],
      },
    ],
    "2008020878": [
      {
        ids: [11082379, 11082380],
        ordinals: [166, 167],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020940": [
      {
        ids: [11086188, 11086189],
        ordinals: [82, 83],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020962": [
      {
        ids: [11087548, 11087549],
        ordinals: [197, 198],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008020963": [
      {
        ids: [11087629, 11087630],
        ordinals: [268, 269],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008021010": [
      {
        ids: [11090462, 11090463],
        ordinals: [78, 79],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ],
    "2008021046": [
      {
        ids: [11092654, 11092655, 11092656],
        ordinals: [233, 235, 236],
        legacy: false,
        nativeContext: [],
        primaryContext: [
          {
            ordinal: 234,
            period: 3,
            second: 148,
            kind: "stoppage",
            description: "GOALIE STOPPED",
          },
        ],
      },
    ],
    "2008021137": [
      {
        ids: [11098192, 11098193],
        ordinals: [114, 116],
        legacy: false,
        nativeContext: [],
        primaryContext: [
          {
            ordinal: 115,
            period: 2,
            second: 391,
            kind: "penalty",
            description:
              "T.B #76 ARTYUKHIN Hi-sticking(2 min), Def. Zone Drawn By: BOS #28 RECCHI",
          },
        ],
      },
    ],
  };
  // The ordinary P1 pair is separate from this game's P3 isolated PS pair.
  // It is enabled only with the full reviewed source decomposition (all four
  // combined ID/ordinal assignments have identical physical/model semantics).
  if (pairedProof?.gameId === 2008020727)
    reviewedEquivalentCases[2008020727] = [
      {
        ids: [11073070, 11073071],
        ordinals: [104, 105],
        legacy: false,
        nativeContext: [],
        primaryContext: [],
      },
    ];
  const shotAssignments = new Map<number, number>();
  const shotIdentityAmbiguities: unknown[] = [];
  const shotTypeAlignments: unknown[] = [];
  const uniqueShotTypeOrdinals = new Set<number>();
  const typeGroups = new Set<string>();
  for (const n of game.plays) {
    if (
      n.typeDescKey !== "shot-on-goal" ||
      n.periodDescriptor.periodType === "SO"
    )
      continue;
    const second = clockSeconds(n.timeInPeriod),
      key = [
        n.periodDescriptor.number,
        second,
        n.details?.eventOwnerTeamId,
        n.details?.shootingPlayerId,
      ].join(":");
    if (typeGroups.has(key)) continue;
    typeGroups.add(key);
    const group = game.plays.filter(
      (p) =>
        p.typeDescKey === "shot-on-goal" &&
        p.periodDescriptor.periodType !== "SO" &&
        p.periodDescriptor.number === n.periodDescriptor.number &&
        clockSeconds(p.timeInPeriod) === second &&
        p.details?.eventOwnerTeamId === n.details?.eventOwnerTeamId &&
        p.details?.shootingPlayerId === n.details?.shootingPlayerId,
    );
    if (group.length < 2) continue;
    const official = report
      .filter(
        (r) =>
          r.kind === "shot-on-goal" &&
          r.period === n.periodDescriptor.number &&
          r.second === second &&
          r.team === n.details?.eventOwnerTeamId &&
          r.shooter === n.details?.shootingPlayerId,
      )
      .map((r) => ({
        ...r,
        team: r.team!,
        shooter: r.shooter!,
        goalie: r.goalie!,
        shotType:
          r.description.match(
            /,\s*(Backhand|Wrist|Snap|Slap|Tip-In|Deflected|Wrap-around)\s*,/i,
          )?.[1] ?? "",
      }));
    const provider = rows.filter(
      (r) =>
        r.gameId === game.id &&
        r.kind === "SHOT" &&
        r.period === n.periodDescriptor.number &&
        r.second === second &&
        r.home === (n.details?.eventOwnerTeamId === game.homeTeam.id) &&
        r.shooter === n.details?.shootingPlayerId,
    );
    const alignment = alignHistoricalShotTypes(
      group,
      official,
      provider,
      game.homeTeam.id,
    );
    if (alignment.status === "unique") {
      for (const m of alignment.matches) {
        shotAssignments.set(m.ordinal, m.eventId);
        uniqueShotTypeOrdinals.add(m.ordinal);
      }
      shotTypeAlignments.push({
        period: n.periodDescriptor.number,
        second,
        teamId: n.details?.eventOwnerTeamId,
        shooterId: n.details?.shootingPlayerId,
        nativePayloads: structuredClone(group),
        alignment,
      });
    }
  }

  for (const spec of reviewedEquivalentCases[game.id] ?? []) {
    const natives = game.plays
      .filter((p) => spec.ids.includes(p.eventId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const official = report
      .filter((r) => spec.ordinals.includes(r.ordinal))
      .sort((a, b) => a.ordinal - b.ordinal);
    const first = natives[0];
    if (
      !first ||
      natives.length !== spec.ids.length ||
      official.length !== spec.ordinals.length
    )
      throw Error("Reviewed equivalent shot source group changed");
    const comparable = (p: Play) => {
      const copy = { ...p };
      delete (copy as Partial<Play>).eventId;
      delete (copy as Partial<Play>).sortOrder;
      return JSON.stringify(copy);
    };
    const nativeContext = game.plays.filter(
      (p) =>
        p.sortOrder >= natives[0]!.sortOrder &&
        p.sortOrder <= natives.at(-1)!.sortOrder &&
        !spec.ids.includes(p.eventId),
    );
    const primaryContext = report
      .filter(
        (r) =>
          r.ordinal > official[0]!.ordinal &&
          r.ordinal < official.at(-1)!.ordinal &&
          !spec.ordinals.includes(r.ordinal),
      )
      .map((r) => ({
        ordinal: r.ordinal,
        period: r.period,
        second: r.second,
        kind: r.kind,
        description: r.description,
      }));
    const groupNative = game.plays.filter(
      (p) =>
        p.typeDescKey === "shot-on-goal" &&
        p.periodDescriptor.periodType !== "SO" &&
        p.periodDescriptor.number === first.periodDescriptor.number &&
        p.timeInPeriod === first.timeInPeriod &&
        p.details?.eventOwnerTeamId === first.details?.eventOwnerTeamId &&
        p.details?.shootingPlayerId === first.details?.shootingPlayerId,
    );
    const groupReport = report.filter(
      (r) =>
        r.kind === "shot-on-goal" &&
        r.period === first.periodDescriptor.number &&
        r.second === clockSeconds(first.timeInPeriod) &&
        r.team === first.details?.eventOwnerTeamId &&
        r.shooter === first.details?.shootingPlayerId,
    );
    const provider = rows.filter(
      (r) =>
        r.gameId === game.id &&
        r.kind === "SHOT" &&
        r.period === first.periodDescriptor.number &&
        r.second === clockSeconds(first.timeInPeriod) &&
        r.shooter === first.details?.shootingPlayerId &&
        r.home === (first.details?.eventOwnerTeamId === game.homeTeam.id),
    );
    const alignment = alignHistoricalShotTypes(
      natives,
      official.map((r) => ({
        ...r,
        team: r.team!,
        shooter: r.shooter!,
        goalie: r.goalie!,
        shotType:
          r.description.match(
            /,\s*(Backhand|Wrist|Snap|Slap|Tip-In|Deflected|Wrap-around)\s*,/i,
          )?.[1] ?? "",
      })),
      provider,
      game.homeTeam.id,
    );
    const contextValid = spec.legacy
      ? natives.length === 2 &&
        natives[1]!.sortOrder === natives[0]!.sortOrder + 1
      : JSON.stringify(nativeContext) === JSON.stringify(spec.nativeContext) &&
        JSON.stringify(primaryContext) ===
          JSON.stringify(spec.primaryContext) &&
        alignment.status === "ambiguous";
    if (
      !contextValid ||
      !natives.every(
        (p) =>
          Number.isSafeInteger(p.sortOrder) &&
          Number.isSafeInteger(p.eventId) &&
          p.typeDescKey === "shot-on-goal" &&
          p.periodDescriptor.periodType !== "SO" &&
          comparable(p) === comparable(first),
      ) ||
      groupNative.length !== spec.ids.length ||
      groupReport.length !== spec.ordinals.length ||
      !official.every(
        (r) =>
          r.kind === "shot-on-goal" &&
          r.period === first.periodDescriptor.number &&
          r.second === clockSeconds(first.timeInPeriod) &&
          r.team === first.details?.eventOwnerTeamId &&
          r.shooter === first.details?.shootingPlayerId &&
          r.goalie === first.details?.goalieInNetId,
      )
    )
      throw Error("Reviewed equivalent shot identity/context changed");
    const ordinalSlots = official.map((r, i) => ({
      nativeEventId: natives[i]!.eventId,
      reportOrdinal: r.ordinal,
      identity: "serialization-only-not-primary-event-identity",
    }));
    for (const slot of ordinalSlots)
      shotAssignments.set(slot.reportOrdinal, slot.nativeEventId);
    shotIdentityAmbiguities.push({
      status: "model-equivalent-ambiguous",
      nativePayloads: structuredClone(natives),
      ordinalSlots,
      interpretation: spec.legacy
        ? "Explicit reviewed case: both complete native payloads are equal except ID/order. Primary report/provider rows establish the ordered raw shot inputs; serialization slots do not resolve original event identity."
        : "Explicit reviewed complete group: full native payloads are equal except ID/order. All ordinal assignments preserve ordered model inputs; any intervening source context is exact. Original event identity remains ambiguous.",
    });
  }
  for (let i = 0; i < retainedUnknownClockOrdinals.length; i++) {
    const event = report.find(
      (e) => e.ordinal === retainedUnknownClockOrdinals[i],
    );
    const native = game.plays.find(
      (p) => p.eventId === retainedUnknownClockIds[i],
    );
    const actor = game.rosterSpots.find(
      (p) => p.playerId === native?.details?.shootingPlayerId,
    );
    const name = event?.description.match(/#(\d+)\s+([^,]+)/);
    if (
      !event ||
      event.kind !== "shot-on-goal" ||
      event.period !== 1 ||
      event.team !== game.awayTeam.id ||
      !actor ||
      !name ||
      Number(name[1]) !== actor.sweaterNumber ||
      !reportSurnameMatches(actor, name[2]!)
    )
      throw Error("Reviewed untrusted-clock primary identity changed");
  }
  const usedNative = new Set<number>(retainedUnknownClockIds),
    usedProvider = new Set<number>(),
    added: Play[] = [],
    patched = new Map<number, Play>();
  const rejected: Array<{ ordinal: number; reason: string }> = [],
    geometryDisagreements: Array<{
      ordinal: number;
      eventId: number;
      official: { x: number; y: number };
      provider: { x: number; y: number };
      officialReportDistanceFeet: number | null;
    }> = [],
    matched: Array<{
      ordinal: number;
      eventId: number;
      providerOrdinal: number;
      identity?: string;
    }> = [];
  for (const event of report) {
    if (retainedUnknownClockOrdinals.includes(event.ordinal)) continue;
    // Preserve the complete zero-minute source row in the audit, without
    // manufacturing a native or priced penalty event.
    if (event.ordinal === awardProof?.reportOnlyAward.ordinal) continue;
    let natives = game.plays.filter(
      (p) =>
        p.typeDescKey === event.kind &&
        p.periodDescriptor.periodType !== "SO" &&
        p.periodDescriptor.number === event.period &&
        clockSeconds(p.timeInPeriod) === event.second &&
        (event.team === undefined ||
          Number(p.details?.eventOwnerTeamId) === event.team) &&
        (event.committed === undefined ||
          Number(p.details?.committedByPlayerId) === event.committed) &&
        !event.invalidBenchActor &&
        !event.invalidPenaltyActor &&
        (event.benchServed === undefined ||
          (p.details?.typeCode === "BEN" &&
            (p.details.committedByPlayerId === undefined ||
              p.details.committedByPlayerId === null ||
              p.details.committedByPlayerId === 0) &&
            Number(p.details?.servedByPlayerId) === event.benchServed &&
            Number(p.details?.duration) === event.benchDuration)) &&
        (event.shooter === undefined ||
          Number(p.details?.shootingPlayerId ?? p.details?.scoringPlayerId) ===
            event.shooter),
    );
    const penaltyAssignment = penaltyAssignments.get(event.ordinal);
    if (event.kind === "penalty" && penaltyAssignment !== undefined)
      natives = natives.filter((p) => p.eventId === penaltyAssignment);
    const shotAssignment = shotAssignments.get(event.ordinal);
    if (shotAssignment !== undefined)
      natives = natives.filter((p) => p.eventId === shotAssignment);
    const pairedSlot = pairedByOrdinal.get(event.ordinal);
    if (pairedSlot)
      natives = natives.filter((p) => p.eventId === pairedSlot.eventId);
    const awardTerminal =
      awardProof && event.ordinal === awardProof.terminalPenaltyShotOrdinal;
    if (awardTerminal)
      natives = natives.filter(
        (p) => p.eventId === awardProof.terminalPenaltyShotEventId,
      );
    if (natives.length > 1) {
      rejected.push({
        ordinal: event.ordinal,
        reason: "Ambiguous native official event",
      });
      continue;
    }
    const native = natives[0];
    if (native && usedNative.has(native.eventId)) {
      rejected.push({
        ordinal: event.ordinal,
        reason: "Native event matches multiple report rows",
      });
      continue;
    }
    let value: Play | undefined = native
      ? { ...native, details: { ...native.details } }
      : undefined;
    if (pairedSlot?.penaltyShot || pairedSlot?.unclassified || awardTerminal) {
      if (!native || !value)
        throw Error("Reviewed primary-only shot native identity changed");
      value.details = {
        ...native.details,
        ...(pairedSlot?.unclassified
          ? { nhlReportUnclassifiedPenaltyShotContext: true }
          : { nhlReportPenaltyShot: true }),
      };
      if (sparse) value.sortOrder = event.ordinal;
      usedNative.add(native.eventId);
      patched.set(native.eventId, value);
      continue;
    }
    if (!native && sparse && event.kind === "missed-shot") {
      // Preserve the independent official attempt even when its raw geometry
      // cannot be recovered. Otherwise the denominator could hide missing MISSes.
      value = {
        eventId: 1000000000 + event.ordinal,
        sortOrder: event.ordinal,
        periodDescriptor: {
          number: event.period,
          periodType: event.period > 3 ? "OT" : "REG",
        },
        timeInPeriod: `${Math.floor(event.second / 60)}:${String(event.second % 60).padStart(2, "0")}`,
        typeDescKey: event.kind,
        ...(event.situation ? { situationCode: event.situation } : {}),
        details: {
          ...(event.team !== undefined ? { eventOwnerTeamId: event.team } : {}),
          ...(event.shooter !== undefined
            ? { shootingPlayerId: event.shooter }
            : {}),
          ...(event.goalie ? { goalieInNetId: event.goalie } : {}),
          ...(event.zone ? { zoneCode: event.zone } : {}),
        },
      };
    }
    const retainUnpriced = () => {
      if (!value) return;
      if (sparse) value.sortOrder = event.ordinal;
      if (native) {
        usedNative.add(native.eventId);
        patched.set(native.eventId, value);
      } else added.push(value);
    };
    if (["shot-on-goal", "goal", "missed-shot"].includes(event.kind)) {
      // A rejected enrichment still retains the native event. Complete invalid
      // native coordinates could otherwise reach the ordinary feature extractor
      // using existing situation/orientation fields, even without any provider
      // match. Fail closed before every early-return path; retain raw evidence.
      const nativeX = native?.details?.xCoord,
        nativeY = native?.details?.yCoord;
      if (
        typeof nativeX === "number" &&
        typeof nativeY === "number" &&
        (!Number.isFinite(nativeX) ||
          !Number.isFinite(nativeY) ||
          Math.abs(nativeX) > 100 ||
          Math.abs(nativeY) > 43 ||
          (nativeX === 0 && nativeY === 0))
      )
        throw Error(
          "Explicit native origin/invalid geometry requires separate source review",
        );
      const matches = rows.filter(
        (r) =>
          r.gameId === game.id &&
          r.ordinal === event.ordinal &&
          r.period === event.period &&
          r.second === event.second &&
          kindMap[r.kind] === event.kind &&
          r.shooter === event.shooter &&
          r.goalie === event.goalie &&
          r.home === (event.team === game.homeTeam.id),
      );
      if (
        matches.length !== 1 ||
        !event.situation ||
        !event.zone ||
        (!native && (!sparse || event.kind !== "missed-shot"))
      ) {
        rejected.push({
          ordinal: event.ordinal,
          reason: "Unverified official/provider shot join",
        });
        retainUnpriced();
        continue;
      }
      const r = matches[0]!;
      const code = `${r.awayGoalie ? 1 : 0}${r.awaySkaters}${r.homeSkaters}${r.homeGoalie ? 1 : 0}`;
      if (
        usedProvider.has(r.ordinal) ||
        code !== event.situation ||
        (native?.details?.goalieInNetId !== undefined &&
          Number(native.details.goalieInNetId) !== r.goalie) ||
        (native?.situationCode !== undefined && native.situationCode !== code)
      ) {
        rejected.push({
          ordinal: event.ordinal,
          reason: "Official/provider shot identity or manpower conflict",
        });
        retainUnpriced();
        continue;
      }
      const details = { ...value?.details };
      const existing = [details.xCoord, details.yCoord];
      const completeOfficialGeometry = existing.every(
        (v) => typeof v === "number" && Number.isFinite(v),
      );
      const validOfficialGeometry =
        completeOfficialGeometry &&
        Math.abs(Number(details.xCoord)) <= 100 &&
        Math.abs(Number(details.yCoord)) <= 43 &&
        !(details.xCoord === 0 && details.yCoord === 0);
      // Archive (0,0) is missing geometry, never a measured rink origin.
      // Independently valid native coordinates retain priority, including goals.
      if (r.x === 0 && r.y === 0 && !validOfficialGeometry) {
        if (completeOfficialGeometry)
          throw Error(
            "Explicit native origin/invalid geometry requires separate source review",
          );
        rejected.push({
          ordinal: event.ordinal,
          reason:
            "Raw archive origin is unknown geometry; native coordinates unavailable",
        });
        retainUnpriced();
        continue;
      }
      const geometryDiffers = ["xCoord", "yCoord"].some(
        (k, i) => details[k] !== undefined && details[k] !== [r.x, r.y][i],
      );
      if (
        (existing.some((v) => v !== undefined) &&
          !validOfficialGeometry &&
          (completeOfficialGeometry || geometryDiffers)) ||
        existing.some(
          (v, i) =>
            v !== undefined &&
            (typeof v !== "number" ||
              !Number.isFinite(v) ||
              Math.abs(v) > [100, 43][i]!),
        )
      ) {
        rejected.push({
          ordinal: event.ordinal,
          reason: "Invalid or incompatible incomplete official native geometry",
        });
        retainUnpriced();
        continue;
      }
      if (validOfficialGeometry && geometryDiffers)
        geometryDisagreements.push({
          ordinal: event.ordinal,
          eventId: native!.eventId,
          official: { x: Number(details.xCoord), y: Number(details.yCoord) },
          provider: { x: r.x, y: r.y },
          officialReportDistanceFeet:
            Number(event.description.match(/\b(\d+) ft\./)?.[1]) || null,
        });
      details.xCoord ??= r.x;
      details.yCoord ??= r.y;
      details.zoneCode ??= event.zone;
      details.shotType ??= r.shotType;
      details.shootingPlayerId ??= r.shooter;
      if (r.goalie) details.goalieInNetId ??= r.goalie;
      details.eventOwnerTeamId = event.team;
      if (/Penalty Shot/i.test(event.description))
        details.nhlReportPenaltyShot = true;
      value ??= {
        eventId: 1000000000 + event.ordinal,
        sortOrder: event.ordinal,
        periodDescriptor: {
          number: event.period,
          periodType: event.period > 3 ? "OT" : "REG",
        },
        timeInPeriod: `${Math.floor(event.second / 60)}:${String(event.second % 60).padStart(2, "0")}`,
        typeDescKey: event.kind,
      };
      value.details = details;
      value.situationCode = code;
      usedProvider.add(r.ordinal);
      matched.push({
        ordinal: event.ordinal,
        eventId: value.eventId,
        providerOrdinal: r.ordinal,
        ...(shotAssignment === undefined
          ? {}
          : {
              identity: uniqueShotTypeOrdinals.has(event.ordinal)
                ? "unique-three-source-shot-type"
                : "model-equivalent-ambiguous-serialization-only",
            }),
      });
    } else if (sparse && !native && event.kind !== "penalty") {
      value = {
        eventId: 1000000000 + event.ordinal,
        sortOrder: event.ordinal,
        periodDescriptor: {
          number: event.period,
          periodType: event.period > 3 ? "OT" : "REG",
        },
        timeInPeriod: `${Math.floor(event.second / 60)}:${String(event.second % 60).padStart(2, "0")}`,
        typeDescKey: event.kind,
        details: {
          ...(event.team !== undefined ? { eventOwnerTeamId: event.team } : {}),
          ...(event.zone ? { zoneCode: event.zone } : {}),
        },
      };
    }
    if (!value) continue;
    if (sparse) value.sortOrder = event.ordinal;
    if (native) {
      usedNative.add(native.eventId);
      patched.set(native.eventId, value);
    } else added.push(value);
  }
  if (sparse && regularPlays.some((p) => !usedNative.has(p.eventId)))
    throw new Error(
      "Sparse native event could not be uniquely aligned to official report",
      {
        cause: {
          unmatchedEventIds: regularPlays
            .filter((p) => !usedNative.has(p.eventId))
            .map((p) => p.eventId),
          rejected,
        },
      },
    );
  const plays = [
    ...game.plays.map(
      (p) => patched.get(p.eventId) ?? { ...p, details: { ...p.details } },
    ),
    ...added,
  ];
  if (new Set(plays.map((p) => p.eventId)).size !== plays.length)
    throw Error("Historical derived event ID collision");
  plays.sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    pbp: { ...game, plays },
    audit: {
      version: ignoredShootoutReportEvents.length
        ? "nhl-historical-raw-shot-bridge-v2"
        : "nhl-historical-raw-shot-bridge-v1",
      gameId: game.id,
      provenance: { ...provenance },
      sparseOfficialFeed: sparse,
      restoredOfficialContextEvents: added.filter(
        (p) => p.typeDescKey !== "missed-shot",
      ).length,
      restoredMisses: added.filter((p) => p.typeDescKey === "missed-shot")
        .length,
      matched,
      rejected,
      ...(retainedUnknownClockIds.length
        ? {
            reviewedUntrustedClockEvents: {
              nativeEventIds: retainedUnknownClockIds,
              reportOrdinals: retainedUnknownClockOrdinals,
              interpretation:
                "Original native events retained without clock, geometry or context enrichment. Entire reviewed first period is unavailable for pricing, training and process; all native exposure remains counted.",
            },
          }
        : {}),
      providerProbabilitiesUsed: false,
      reportLineupWarnings: report
        .filter((e) => e.shooterAbsentFromReportLineup)
        .map((e) => ({
          ordinal: e.ordinal,
          shooter: e.shooter,
          reason:
            "Official shot description identifies shooter absent from report on-ice list; no lineup membership inferred",
        })),
      interpretation:
        "Raw provider geometry only after independent official ordinal/clock/team/player/goalie/manpower joins. Provider predictions and derived model features excluded; own shot model and unchanged physical/source gates remain required.",
      ...(geometryDisagreements.length ? { geometryDisagreements } : {}),
      ...(penaltyAlignments.length ? { penaltyAlignments } : {}),
      ...(shotIdentityAmbiguities.length ? { shotIdentityAmbiguities } : {}),
      ...(shotTypeAlignments.length ? { shotTypeAlignments } : {}),
      ...(pairedProof
        ? {
            pairedPenaltyShotSource: {
              ...pairedProof,
              appliedOrdinalSlots: pairedSlots,
            },
          }
        : {}),
      ...(gsProof ? { supplementalPenaltySource: gsProof } : {}),
      ...(awardProof ? { reportOnlyPenaltyShotAward: awardProof } : {}),
      ...(ignoredShootoutReportEvents.length
        ? { ignoredShootoutReportEvents }
        : {}),
    },
  };
}

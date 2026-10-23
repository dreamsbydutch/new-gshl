import { load } from "cheerio";
import { createHash } from "node:crypto";
import type { GameValueData, PenaltyEvent } from "./game-value-input";
import { alignHistoricalPenaltyGroup } from "./historical-penalty-alignment";
import { reviewedEventSourcePeriods } from "./reviewed-event-source-availability";
import { parseOfficialShiftReport } from "./official-shift-report";

type Game = Pick<
  GameValueData,
  | "gameId"
  | "date"
  | "homeTeam"
  | "awayTeam"
  | "players"
  | "penalties"
  | "gameSeconds"
>;
type Person = {
  playerId: number;
  teamId: number;
  sweaterNumber: number;
  positionCode: string;
  firstName?: { default: string };
  lastName: { default: string };
};
type Play = {
  eventId: number;
  sortOrder: number;
  timeInPeriod: string;
  situationCode?: string;
  periodDescriptor: { number: number; periodType: string };
  typeDescKey: string;
  details?: Record<string, unknown>;
};
type Pbp = {
  id: number;
  gameDate: string;
  homeTeam: { id: number; abbrev: string };
  awayTeam: { id: number; abbrev: string };
  rosterSpots: Person[];
  plays: Play[];
};
type Lineup = {
  ids: number[];
  skaters: number;
  goalies: number;
  normalized: number;
};
type Row = {
  ordinal: number;
  period: number;
  second: number;
  kind: string;
  description: string;
  away: Lineup | null;
  home: Lineup | null;
  code: string | null;
};
type Interval = {
  playerId: number;
  teamId: number;
  period: number;
  start: number;
  end: number;
};
export type UnclockedPenaltyControlRow = {
  ordinal: number;
  period: 4;
  kind: "PEND";
  rawClock: string;
  description: string;
  reportSha256: string;
  previous: { ordinal: number; period: 3; kind: "PEND"; rawClock: string };
  next: { ordinal: number; period: 4; kind: "PSTR"; rawClock: string };
};
// Five exact retained reports contain a misplaced, unclocked end marker before
// overtime starts. It is control metadata only; no event time is inferred.
const reviewedUnclockedEnds: Record<
  number,
  { ordinal: number; reportSha256: string; description: string }
> = {
  2008020012: {
    ordinal: 307,
    reportSha256:
      "11cc3c292386baf7e3bede3bc48fca9879c882c08632b4e717993d1eaf376eb8",
    description: "Period End- Local time: 10:10 EDT",
  },
  2008020257: {
    ordinal: 354,
    reportSha256:
      "34072b73a5e2c657a19f0a4d60ef8dbb98d5deb56e4e6d0ceece9c7279206439",
    description: "Period End- Local time: 9:36 EST",
  },
  2008020445: {
    ordinal: 315,
    reportSha256:
      "06c6d59225dc09120055fab24c4cd4536f455b77e50e1b042ac42ab694456372",
    description: "Period End- Local time: 10:03 PST",
  },
  2008020826: {
    ordinal: 338,
    reportSha256:
      "422942ef188bdf798a96fd473ab0806b9211dba7c4c1196247fdc1bc54c77eff",
    description: "Period End- Local time: 3:49 PST",
  },
  2008020981: {
    ordinal: 333,
    reportSha256:
      "f1ff67ff16cfcdc71dd256398720424741ef738c9a0bf9dc45fde613526a755c",
    description: "Period End- Local time: 5:45 EDT",
  },
};

const reviewedShootoutSources: Record<
  number,
  {
    rawPbp: string;
    box: string;
    home: string;
    away: string;
  }
> = {
  2008020012: {
    rawPbp: "a64ed470960f9d15421e9dacba38be1f00b4ed281b0e8baf66cffb40e89b71dc",
    box: "57f7a850c486f6174977f6c9ca7ab3bf88d4b2e5c8c4fbe585b30d065304d524",
    home: "d2a65d2c8912e974a0e283c20cbb92deb367f820432780319c70e136b3146564",
    away: "ff359977ea52fbe41d8ea0acbf31639b0f0a5bbdd67a14e0d70d5513106d00b6",
  },
  2008020257: {
    rawPbp: "3cd2875030456d1e57615241bdaf27aff1f395c5632b361677b97c1aa887e34b",
    box: "05b86c35b8b878b473e30ab521a37018f8a8ca6892d9bac3cce1cd1b525d85b1",
    home: "5e75201e97fab808d9fc61ad27bd8444bae7fc2d80c10c1ca146fe6f9d6d0f8a",
    away: "34321c928346b2943c83044e005bcceed7373387f656006a014bcfa685b4870b",
  },
  2008020445: {
    rawPbp: "48071be8fcf4682e6cd1bf8cd04cd98af2dbbe0161eddd9eaf34134c19b266fc",
    box: "776a0a5e619cfde8d0abb708d7d84f59484794c948bf81c89e77520df7cffb74",
    home: "35c3b807b644d73dea44e8b4e49577ed4099f81b7b6d986dea465862ece895dc",
    away: "66c235c90fc74be660d35cba644d0a9678ff2fed530633e5cf26dc5ee3c760ec",
  },
  2008020826: {
    rawPbp: "cb5f147bd9ce4ea399e7e8ea23fc6453ea8413afbb40a5e4a87975ce4745ebf5",
    box: "ffac0f8cbe2bda66a59107934f0964589194b6872cfa3ca0db2786b2ded6d225",
    home: "804f18086070ac0841407c9af3dac64ae7c7467db8a740fa09a39deb965733e6",
    away: "c507c7c228a1efe3b18b166d54daad5e9df3250a0f2773a8dacddb8b070d6426",
  },
  2008020981: {
    rawPbp: "365f5a62aa8280fcfbf03e803d77acb2096a7ccb370881e41f115a07a3e1742c",
    box: "f5add699ce46d7d02d868a09194470ce26fcf4dfaf1416a950dcdb33d26091ca",
    home: "5f451bd8fb8e0210911c60c9c5a850336e1141935377dd6f35e384559f0ecde8",
    away: "02a0b265099ba644758bc9e9892eab1278f40c736232690f28a4e14e7157d27e",
  },
};
export function isReviewedOvertimeClockGame(gameId: number): boolean {
  return integer(gameId) && Object.hasOwn(reviewedShootoutSources, gameId);
}
export type ReviewedOvertimeClockRecoveryAudit = {
  version: "nhl-reviewed-overtime-clock-recovery-v1";
  gameId: number;
  period: 4;
  elapsedSeconds: 300;
  evidence: "completed-native-and-primary-shootout-after-overtime";
  reportSha256: string;
  rawPbpSha256: string;
  unclockedControlRows: UnclockedPenaltyControlRow[];
  primaryOvertimeStartOrdinal: number;
  primaryShootoutOrdinals: number[];
  nativeShootoutEventIds: number[];
  goalieParticipation: Array<{
    playerId: number;
    teamId: number;
    reportSha256: string;
    periods: Array<{ period: number; seconds: number }>;
    reportTotalSeconds: number;
    boxSeconds: number;
    reportMinusBoxSeconds: number;
    overtimeSeconds: number;
  }>;
  interpretation: string;
};

/** Certifies elapsed overtime, never goalie participation or an invented event.
 * These five exact primary reports and original NHL feeds independently record
 * completed shootouts after regular-season overtime. Goalie footer discrepancies
 * remain source facts, including both ten-second discrepancies in game0012. */
export function recoverReviewedOvertimeClock(
  input: {
    pbp: unknown;
    box: unknown;
    shifts: readonly unknown[];
    officialPeriodEnds?: readonly { period: number; seconds: number }[];
  },
  reports: {
    rawPbpJson: string;
    playReportHtml: string;
    homeShiftReportHtml: string;
    awayShiftReportHtml: string;
  },
): {
  officialPeriodEnds: Array<{ period: number; seconds: number }>;
  audit: ReviewedOvertimeClockRecoveryAudit;
} {
  const pbp = input.pbp as Pbp;
  const expected = reviewedShootoutSources[pbp?.id];
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  if (
    !expected ||
    !isReviewedOvertimeClockGame(pbp.id) ||
    digest(reports.rawPbpJson) !== expected.rawPbp ||
    digest(reports.playReportHtml) !==
      reviewedUnclockedEnds[pbp.id]!.reportSha256 ||
    digest(reports.homeShiftReportHtml) !== expected.home ||
    digest(reports.awayShiftReportHtml) !== expected.away ||
    digest(JSON.stringify(input.box)) !== expected.box
  )
    throw Error("Reviewed overtime clock source scope or exact bytes differ");
  const native = JSON.parse(reports.rawPbpJson) as Pbp;
  const top = object(native),
    effective = object(pbp),
    box = object(input.box);
  for (const source of [top, effective]) {
    if (
      source.id !== native.id ||
      source.gameDate !== native.gameDate ||
      JSON.stringify(source.homeTeam) !== JSON.stringify(top.homeTeam) ||
      JSON.stringify(source.awayTeam) !== JSON.stringify(top.awayTeam) ||
      source.gameType !== 2 ||
      !["OFF", "FINAL"].includes(String(source.gameState)) ||
      object(source.gameOutcome).lastPeriodType !== "SO" ||
      object(source.periodDescriptor).periodType !== "SO" ||
      object(source.periodDescriptor).number !== 5
    )
      throw Error(
        "Reviewed overtime clock requires the same completed native shootout",
      );
  }
  if (
    box.id !== native.id ||
    box.gameDate !== native.gameDate ||
    !Array.isArray(pbp.plays) ||
    !Array.isArray(native.plays) ||
    JSON.stringify(pbp.rosterSpots) !== JSON.stringify(native.rosterSpots) ||
    !Array.isArray(input.shifts) ||
    input.shifts.some((s) => object(s).gameId !== native.id)
  )
    throw Error(
      "Reviewed overtime clock game, roster or shift identity differs",
    );
  if (
    input.officialPeriodEnds &&
    (input.officialPeriodEnds.length !== 1 ||
      input.officialPeriodEnds[0]?.period !== 4 ||
      input.officialPeriodEnds[0]?.seconds !== 300)
  )
    throw Error("Reviewed overtime clock conflicts with existing period end");
  const nativeSo = native.plays.filter((p) => p.periodDescriptor.number === 5);
  const effectiveSo = pbp.plays.filter((p) => p.periodDescriptor.number === 5);
  if (
    !nativeSo.length ||
    JSON.stringify(nativeSo) !== JSON.stringify(effectiveSo) ||
    new Set(nativeSo.map((p) => p.eventId)).size !== nativeSo.length ||
    new Set(nativeSo.map((p) => p.sortOrder)).size !== nativeSo.length
  )
    throw Error("Reviewed overtime clock native shootout facts changed");
  for (const play of [...native.plays, ...pbp.plays]) {
    const period = play.periodDescriptor.number;
    if (
      !integer(play.eventId) ||
      !integer(play.sortOrder) ||
      !integer(period) ||
      period < 1 ||
      period > 5 ||
      clock(play.timeInPeriod) >
        (period <= 3 ? 1200 : period === 4 ? 300 : 0) ||
      (period === 4 && play.typeDescKey === "goal") ||
      (period === 5 && play.periodDescriptor.periodType !== "SO")
    )
      throw Error(
        "Reviewed overtime clock invalid native chronology or overtime winning goal",
      );
  }
  const parsed = parseReport(reports.playReportHtml, pbp);
  if (parsed.unclockedControlRows.length !== 1)
    throw Error(
      "Reviewed overtime clock requires its exact unclocked control marker",
    );
  const start = parsed.rows.filter(
    (r) => r.period === 4 && r.kind === "PSTR" && r.second === 0,
  );
  if (
    start.length !== 1 ||
    parsed.rows.some((r) => r.period === 4 && r.kind === "GOAL")
  )
    throw Error("Reviewed overtime clock primary overtime chronology differs");
  const $ = load(reports.playReportHtml),
    so: Array<{ ordinal: number; kind: string; description: string }> = [];
  $("tr").each((_, tr) => {
    const f = $(tr)
      .children("td")
      .toArray()
      .map((td) => $(td).text().replace(/\s+/g, " ").trim());
    if (f.length !== 8 || !/^\d+$/.test(f[0]!) || f[1] !== "5") return;
    if (f[3] !== "0:000:00")
      throw Error("Reviewed overtime clock shootout time differs");
    so.push({ ordinal: Number(f[0]), kind: f[4]!, description: f[5]! });
  });
  if (
    so.length < 6 ||
    so[0]?.kind !== "PSTR" ||
    so
      .slice(-3)
      .map((r) => r.kind)
      .join("|") !== "SOC|PEND|GEND" ||
    so.some(
      (r, i) =>
        r.ordinal <= start[0]!.ordinal ||
        (i > 0 && r.ordinal !== so[i - 1]!.ordinal + 1),
    ) ||
    so.slice(1, -3).some((r) => !["SHOT", "MISS", "GOAL"].includes(r.kind)) ||
    so.length - 4 !== nativeSo.length ||
    so.slice(1, -3).filter((r) => r.kind === "GOAL").length !==
      nativeSo.filter((p) => p.typeDescKey === "goal").length ||
    parsed.rows.some((r) => r.period === 4 && r.ordinal >= so[0]!.ordinal)
  )
    throw Error(
      "Reviewed overtime clock primary completed shootout sequence differs",
    );
  const participation: ReviewedOvertimeClockRecoveryAudit["goalieParticipation"] =
    [];
  for (const [home, html, reportSha] of [
    [true, reports.homeShiftReportHtml, expected.home],
    [false, reports.awayShiftReportHtml, expected.away],
  ] as const) {
    // Existing strict report parser independently verifies title/date/game,
    // unique rostered headings and full-period goalie summary semantics.
    parseOfficialShiftReport(html, native, home, [], true);
    const teamId = (home ? native.homeTeam : native.awayTeam).id;
    const goalies = object(
      object(box.playerByGameStats)[home ? "homeTeam" : "awayTeam"],
    ).goalies;
    if (!Array.isArray(goalies))
      throw Error("Reviewed overtime clock missing official goalie rows");
    const page = load(html),
      summaries = new Map<number, Map<string, number>>();
    let person: Person | undefined;
    page("tr").each((_, tr) => {
      const heading = page(tr).children("td.playerHeading");
      if (heading.length) {
        const jersey = Number(heading.text().trim().match(/^\d+/)?.[0]);
        const people = native.rosterSpots.filter(
          (p) => p.teamId === teamId && p.sweaterNumber === jersey,
        );
        if (people.length !== 1)
          throw Error("Reviewed overtime clock shift roster differs");
        person = people[0];
      }
      const f = page(tr)
        .children("td")
        .toArray()
        .map((td) => page(td).text().replace(/\s+/g, " ").trim());
      if (
        person?.positionCode !== "G" ||
        f.length !== 7 ||
        !["1", "2", "3", "OT", "TOT"].includes(f[0]!)
      )
        return;
      const seconds = clock(f[3]);
      if (f.slice(4).reduce((n, v) => n + clock(v), 0) !== seconds)
        throw Error("Reviewed overtime clock goalie strength footer differs");
      let summary = summaries.get(person.playerId);
      if (!summary) summaries.set(person.playerId, (summary = new Map()));
      if (summary.has(f[0]!))
        throw Error("Reviewed overtime clock duplicate goalie footer");
      summary.set(f[0]!, seconds);
    });
    for (const raw of goalies) {
      const goalie = object(raw),
        id = Number(goalie.playerId),
        boxSeconds = clock(goalie.toi);
      if (!boxSeconds) continue;
      const summary = summaries.get(id);
      if (!summary || !summary.has("TOT"))
        throw Error("Reviewed overtime clock missing playing goalie footer");
      const periods = [...summary]
        .filter(([p]) => p !== "TOT")
        .map(([p, seconds]) => ({
          period: p === "OT" ? 4 : Number(p),
          seconds,
        }));
      const reportTotalSeconds = summary.get("TOT")!;
      if (
        periods.some(
          (p) => p.seconds < 0 || p.seconds > (p.period === 4 ? 300 : 1200),
        ) ||
        periods.reduce((n, p) => n + p.seconds, 0) !== reportTotalSeconds ||
        reportTotalSeconds - boxSeconds !== (native.id === 2008020012 ? -10 : 0)
      )
        throw Error(
          "Reviewed overtime clock goalie participation differs from reviewed source",
        );
      participation.push({
        playerId: id,
        teamId,
        reportSha256: reportSha,
        periods,
        reportTotalSeconds,
        boxSeconds,
        reportMinusBoxSeconds: reportTotalSeconds - boxSeconds,
        overtimeSeconds: summary.get("OT") ?? 0,
      });
    }
  }
  return {
    officialPeriodEnds: [{ period: 4, seconds: 300 }],
    audit: {
      version: "nhl-reviewed-overtime-clock-recovery-v1",
      gameId: native.id,
      period: 4,
      elapsedSeconds: 300,
      evidence: "completed-native-and-primary-shootout-after-overtime",
      reportSha256: digest(reports.playReportHtml),
      rawPbpSha256: expected.rawPbp,
      unclockedControlRows: parsed.unclockedControlRows,
      primaryOvertimeStartOrdinal: start[0]!.ordinal,
      primaryShootoutOrdinals: so.map((r) => r.ordinal),
      nativeShootoutEventIds: nativeSo.map((p) => p.eventId),
      goalieParticipation: participation,
      interpretation:
        "Completed regular-season shootout proves five elapsed overtime minutes. Goalie participation and its reviewed footer/box discrepancies are retained, never extended to elapsed time. No event, PBP fact, shift or player TOI is changed.",
    },
  };
}
export type OfficialPenaltyContextGroupAudit = {
  period: number;
  second: number;
  absoluteSecond: number;
  nativeEventIds: number[];
  reportOrdinals: number[];
  status: "recovered" | "withheld" | "native-preserved" | "no-priced-sanctions";
  reasons: string[];
  primaryRows: Array<{
    ordinal: number;
    kind: string;
    description: string;
    code: string | null;
    eventId?: number;
  }>;
  witness?: {
    away: Lineup;
    home: Lineup;
    primaryAway: Lineup;
    primaryHome: Lineup;
    exactPlayerMembership: boolean;
  };
};
export type OfficialPenaltyContextRecoveryAudit = {
  version: "nhl-official-penalty-context-recovery-v1";
  gameId: number;
  status: "recovered" | "unchanged" | "source-unavailable";
  groups: OfficialPenaltyContextGroupAudit[];
  changes: Array<{
    eventId: number;
    before: { homeBefore: number | null; awayBefore: number | null };
    after: { homeBefore: number; awayBefore: number };
  }>;
  unclockedControlRows?: UnclockedPenaltyControlRow[];
};
export type OfficialPenaltyContextInput = {
  pbp: unknown;
  box: unknown;
  shifts: readonly unknown[];
  game: Game;
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const teamCode = (s: string) =>
  (({ TB: "TBL", SJ: "SJS", LA: "LAK", NJ: "NJD" }) as Record<string, string>)[
    normalize(s)
  ] ?? normalize(s);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid penalty context source object");
  return value as Record<string, unknown>;
}
function clock(value: unknown): number {
  if (typeof value !== "string" || !/^\d+:\d{2}$/.test(value))
    throw Error("Invalid penalty context clock");
  const [m, s] = value.split(":").map(Number);
  if (s! >= 60) throw Error("Invalid penalty context clock");
  return m! * 60 + s!;
}
function nameMatches(person: Person, surname: string) {
  const current = normalize(person.lastName.default),
    printed = normalize(surname);
  return (
    current === printed ||
    (person.playerId === 8471269 &&
      normalize(person.firstName?.default ?? "") === "NICKLAS" &&
      current === "GROSSMANN" &&
      printed === "GROSSMAN")
  );
}
function lineup(text: string, team: number, roster: Person[]): Lineup | null {
  const tokens = [...text.matchAll(/\b(\d{1,2})\s+([CDLRWG]{1,2})\b/g)];
  if (
    !tokens.length ||
    text.replace(/\b(\d{1,2})\s+([CDLRWG]{1,2})\b/g, "").trim()
  )
    return null;
  const ids: number[] = [];
  let skaters = 0,
    goalies = 0;
  for (const token of tokens) {
    const people = roster.filter(
      (p) => p.teamId === team && p.sweaterNumber === Number(token[1]),
    );
    if (
      people.length !== 1 ||
      ids.includes(people[0]!.playerId) ||
      (token[2] === "G") !== (people[0]!.positionCode === "G")
    )
      return null;
    ids.push(people[0]!.playerId);
    if (token[2] === "G") goalies++;
    else skaters++;
  }
  const normalized = skaters - Number(goalies === 0);
  return goalies <= 1 &&
    skaters + goalies <= 6 &&
    normalized >= 3 &&
    normalized <= 5
    ? { ids: ids.sort((a, b) => a - b), skaters, goalies, normalized }
    : null;
}
function parseReport(
  html: string,
  pbp: Pbp,
): { rows: Row[]; unclockedControlRows: UnclockedPenaltyControlRow[] } {
  const $ = load(html),
    cells = $("td")
      .toArray()
      .map((td) => $(td).text().replace(/\s+/g, " ").trim());
  const expectedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(pbp.gameDate + "T00:00:00Z"));
  if (
    $("title").text().trim().toLowerCase() !== "play by play" ||
    !cells.includes(expectedDate) ||
    !cells.some((text) => {
      const match = text.match(/^(?:Match\/)?Game\s+(\d+)$/);
      return match && Number(match[1]) === pbp.id % 10000;
    })
  )
    throw Error("Penalty context primary game scope differs");
  const rows: Row[] = [],
    ordinals = new Set<number>(),
    primary: Array<{ ordinal: number; period: number; values: string[] }> = [],
    unclockedControlRows: UnclockedPenaltyControlRow[] = [];
  $("tr").each((_, tr) => {
    const columns = $(tr).children("td");
    if (columns.length !== 8) return;
    const values = columns
      .toArray()
      .map((td) => $(td).text().replace(/\s+/g, " ").trim());
    if (!/^\d+$/.test(values[0]!) || !/^\d+$/.test(values[1]!)) return;
    const ordinal = Number(values[0]),
      period = Number(values[1]);
    if (!ordinal || period < 1 || period > 4) return;
    if (ordinals.has(ordinal))
      throw Error("Duplicate penalty context primary ordinal");
    ordinals.add(ordinal);
    primary.push({ ordinal, period, values });
  });
  primary.sort((a, b) => a.ordinal - b.ordinal);
  for (const [index, item] of primary.entries()) {
    const { ordinal, period, values } = item;
    const rawClock = values[3]!.match(/^(\d+:\d{2})/)?.[1];
    if (!rawClock) {
      const reviewed = reviewedUnclockedEnds[pbp.id],
        previous = primary[index - 1],
        next = primary[index + 1];
      const reportSha256 = createHash("sha256").update(html).digest("hex");
      if (
        !reviewed ||
        reviewed.ordinal !== ordinal ||
        reviewed.reportSha256 !== reportSha256 ||
        period !== 4 ||
        values[2] !== "" ||
        values[3] !== "-16:0-120:00" ||
        values[4] !== "PEND" ||
        values[5] !== reviewed.description ||
        values[6] !== "" ||
        values[7] !== "" ||
        !previous ||
        previous.ordinal !== ordinal - 1 ||
        previous.period !== 3 ||
        previous.values[3] !== "20:000:00" ||
        previous.values[4] !== "PEND" ||
        !next ||
        next.ordinal !== ordinal + 1 ||
        next.period !== 4 ||
        next.values[3] !== "0:005:00" ||
        next.values[4] !== "PSTR"
      )
        throw Error(
          "Missing penalty context primary clock; no exact reviewed control row",
        );
      const physicalKinds = new Set([
        "penalty",
        "goal",
        "shot-on-goal",
        "missed-shot",
        "blocked-shot",
        "faceoff",
        "hit",
        "giveaway",
        "takeaway",
      ]);
      if (
        pbp.plays.some(
          (play) =>
            play.periodDescriptor.number <= 4 &&
            play.sortOrder > previous.ordinal &&
            play.sortOrder < next.ordinal &&
            physicalKinds.has(play.typeDescKey),
        )
      )
        throw Error(
          "Reviewed unclocked control gap contains a native model event",
        );
      unclockedControlRows.push({
        ordinal,
        period: 4,
        kind: "PEND",
        rawClock: values[3],
        description: values[5]!,
        reportSha256,
        previous: {
          ordinal: previous.ordinal,
          period: 3,
          kind: "PEND",
          rawClock: previous.values[3]!,
        },
        next: {
          ordinal: next.ordinal,
          period: 4,
          kind: "PSTR",
          rawClock: next.values[3]!,
        },
      });
      continue;
    }
    const second = clock(rawClock);
    if (second > (period <= 3 ? 1200 : 300))
      throw Error("Penalty context primary clock exceeds period");
    const away = lineup(values[6]!, pbp.awayTeam.id, pbp.rosterSpots),
      home = lineup(values[7]!, pbp.homeTeam.id, pbp.rosterSpots);
    rows.push({
      ordinal,
      period,
      second,
      kind: values[4]!,
      description: values[5]!,
      away,
      home,
      code:
        away && home
          ? `${away.goalies}${away.skaters}${home.skaters}${home.goalies}`
          : null,
    });
  }
  if (!rows.length)
    throw Error("Penalty context primary event rows unavailable");
  return { rows, unclockedControlRows };
}
function reportIdentity(row: Row, pbp: Pbp) {
  const printed = row.description.match(
    /^(\S+)\s+(?:#(\d+)\s+(.+?)|TEAM\s+(.+?))\((\d+)\s+min\)/i,
  );
  if (!printed) return null;
  const teams = [pbp.homeTeam, pbp.awayTeam].filter(
    (team) => teamCode(team.abbrev) === teamCode(printed[1]!),
  );
  if (teams.length !== 1) return null;
  let committedByPlayerId: number | null = null,
    offence: string;
  const duration = Number(printed[5]);
  if (printed[2]) {
    const people = pbp.rosterSpots.filter(
      (person) =>
        person.teamId === teams[0]!.id &&
        person.sweaterNumber === Number(printed[2]),
    );
    if (people.length !== 1) return null;
    const words = printed[3]!.trim().split(/\s+/);
    let n = 0;
    for (let i = 1; i <= words.length; i++)
      if (nameMatches(people[0]!, words.slice(0, i).join(" "))) n = i;
    if (!n) return null;
    committedByPlayerId = people[0]!.playerId;
    offence = words.slice(n).join(" ");
  } else offence = printed[4]!;
  const typeCode =
    committedByPlayerId === null
      ? "BEN"
      : /\(maj\)\s*$/i.test(offence) && duration === 5
        ? "MAJ"
        : /^Match penalty$/i.test(offence) && duration === 10
          ? "MAT"
          : /^(?:Game Misconduct|Aggressor)$/i.test(offence) && duration === 10
            ? "GAM"
            : /^(?:Misconduct|Instigator\s*-\s*Misconduct)$/i.test(offence) &&
                duration === 10
              ? "MIS"
              : duration === 2 || duration === 4
                ? "MIN"
                : null;
  if (!typeCode || (typeCode === "BEN" && duration !== 2)) return null;
  const actor = (marker: string, team: number) => {
    const match = row.description.match(
      new RegExp(
        `${marker}:\\s*(?:(\\S+)\\s+)?#(\\d+)\\s+([^,]+?)(?=\\s+(?:Drawn By|Served By):|,|$)`,
        "i",
      ),
    );
    if (!match)
      return {
        present: row.description
          .toLowerCase()
          .includes(`${marker}:`.toLowerCase()),
        id: undefined as number | undefined,
      };
    const expectedTeam = [pbp.homeTeam, pbp.awayTeam].find(
      (p) => p.id === team,
    )!;
    if (match[1] && teamCode(match[1]) !== teamCode(expectedTeam.abbrev))
      return { present: true, id: undefined as number | undefined };
    const people = pbp.rosterSpots.filter(
      (p) =>
        p.teamId === team &&
        p.sweaterNumber === Number(match[2]) &&
        nameMatches(p, match[3]!.trim()),
    );
    return {
      present: true,
      id: people.length === 1 ? people[0]!.playerId : undefined,
    };
  };
  const served = actor("Served By", teams[0]!.id),
    drawn = actor(
      "Drawn By",
      teams[0]!.id === pbp.homeTeam.id ? pbp.awayTeam.id : pbp.homeTeam.id,
    );
  if (
    (served.present && served.id === undefined) ||
    (drawn.present && drawn.id === undefined)
  )
    return null;
  if (
    typeCode === "BEN" &&
    (!served.id ||
      pbp.rosterSpots.find((p) => p.playerId === served.id)?.positionCode ===
        "G")
  )
    return null;
  return {
    ordinal: row.ordinal,
    period: row.period,
    second: row.second,
    teamId: teams[0]!.id,
    committedByPlayerId,
    ...(served.id ? { servedByPlayerId: served.id } : {}),
    duration,
    typeCode,
    offence: offence.replace(/\s*\(maj\)\s*$/i, ""),
    drawnByPlayerId: drawn.id,
  };
}

/** Source recovery only. No rating, PBP, actor, assessment or shift is modified. */
export function recoverOfficialPenaltyContexts(
  input: OfficialPenaltyContextInput,
  html: string,
): { penalties: PenaltyEvent[]; audit: OfficialPenaltyContextRecoveryAudit } {
  const { game } = input,
    pbp = input.pbp as Pbp;
  if (
    !integer(game.gameId) ||
    Math.floor(game.gameId / 10000) !== 200802 ||
    pbp?.id !== game.gameId ||
    pbp.gameDate !== game.date ||
    pbp.homeTeam?.id !== game.homeTeam ||
    pbp.awayTeam?.id !== game.awayTeam ||
    !Array.isArray(pbp.rosterSpots) ||
    !Array.isArray(pbp.plays) ||
    !Array.isArray(input.shifts)
  )
    throw Error(
      "Penalty context recovery requires exact 2008 regular-season game sources",
    );
  const box = object(input.box);
  if (box.id !== game.gameId || box.gameDate !== game.date)
    throw Error("Penalty context official box game identity differs");
  const penalties = game.penalties.map((p) => ({ ...p }));
  const audit: OfficialPenaltyContextRecoveryAudit = {
    version: "nhl-official-penalty-context-recovery-v1",
    gameId: game.gameId,
    status: "unchanged",
    groups: [],
    changes: [],
  };
  const unavailable = reviewedEventSourcePeriods(pbp);
  let rows: Row[];
  try {
    const parsed = parseReport(html, pbp);
    rows = parsed.rows;
    if (parsed.unclockedControlRows.length)
      audit.unclockedControlRows = parsed.unclockedControlRows;
  } catch (error) {
    // Only the three independently reviewed empty report bodies are unavailable.
    // A partial-period review never excuses a wrong date/game or malformed report.
    const knownEmpty = [2008020259, 2008020409, 2008021077].includes(
      game.gameId,
    );
    if (!knownEmpty || unavailable.size !== 4) throw error;
    const metadata = object(object(pbp).reviewedEventSourceAvailability);
    const reviewedHash = object(metadata.sourceHashes).playReportSha256;
    if (createHash("sha256").update(html).digest("hex") !== reviewedHash)
      throw error;
    audit.status = "source-unavailable";
    return { penalties, audit };
  }
  if (
    new Set(pbp.rosterSpots.map((p) => p.playerId)).size !==
      pbp.rosterSpots.length ||
    pbp.rosterSpots.some(
      (p) =>
        !integer(p.playerId) ||
        ![game.homeTeam, game.awayTeam].includes(p.teamId),
    )
  )
    throw Error("Invalid penalty context roster identity");
  const native = pbp.plays.filter(
    (p) =>
      p.typeDescKey === "penalty" && p.periodDescriptor.periodType !== "SO",
  );
  if (
    new Set(native.map((p) => p.eventId)).size !== native.length ||
    new Set(native.map((p) => p.sortOrder)).size !== native.length ||
    native.some(
      (p) =>
        !integer(p.eventId) ||
        p.eventId <= 0 ||
        !integer(p.sortOrder) ||
        p.sortOrder < 0 ||
        !integer(p.periodDescriptor.number) ||
        p.periodDescriptor.number < 1 ||
        p.periodDescriptor.number > 4 ||
        clock(p.timeInPeriod) > (p.periodDescriptor.number <= 3 ? 1200 : 300) ||
        p.periodDescriptor.periodType !==
          (p.periodDescriptor.number <= 3 ? "REG" : "OT"),
    )
  )
    throw Error("Invalid penalty context native event identity/order/clock");
  const ledger = new Map(game.penalties.map((p) => [p.eventId, p]));
  if (ledger.size !== game.penalties.length)
    throw Error("Duplicate penalty context ledger identity");
  if (game.penalties.some((p) => !native.some((n) => n.eventId === p.eventId)))
    throw Error("Penalty ledger contains an unknown native assessment");
  const intervals: Interval[] = [],
    invalidPeriods = new Set<number>();
  for (const raw of input.shifts) {
    const shift = object(raw),
      period = shift.period;
    if (shift.gameId !== game.gameId)
      throw Error("Penalty context shift source game identity differs");
    if (!integer(period) || period < 1 || period > 4) {
      for (let p = 1; p <= 4; p++) invalidPeriods.add(p);
      continue;
    }
    try {
      const start = clock(shift.startTime),
        end = clock(shift.endTime),
        limit = period <= 3 ? 1200 : game.gameSeconds - 3600;
      if (
        shift.gameId !== game.gameId ||
        shift.typeCode !== 517 ||
        !integer(shift.playerId) ||
        !integer(shift.teamId) ||
        !pbp.rosterSpots.some(
          (p) => p.playerId === shift.playerId && p.teamId === shift.teamId,
        ) ||
        start < 0 ||
        end < start ||
        end > limit
      ) {
        invalidPeriods.add(period);
        continue;
      }
      intervals.push({
        playerId: shift.playerId,
        teamId: shift.teamId,
        period,
        start,
        end,
      });
    } catch {
      invalidPeriods.add(period);
    }
  }
  const groupedIntervals = new Map<string, Interval[]>();
  for (const interval of intervals) {
    const key = `${interval.playerId}:${interval.period}`,
      group = groupedIntervals.get(key) ?? [];
    group.push(interval);
    groupedIntervals.set(key, group);
  }
  for (const group of groupedIntervals.values()) {
    group.sort((a, b) => a.start - b.start || a.end - b.end);
    if (group.some((s, i) => i > 0 && s.start < group[i - 1]!.end))
      invalidPeriods.add(group[0]!.period);
  }
  const official = new Map<number, number>();
  for (const side of Object.values(object(object(input.box).playerByGameStats)))
    for (const players of Object.values(object(side))) {
      if (!Array.isArray(players))
        throw Error("Invalid penalty context official appearances");
      for (const value of players) {
        const player = object(value);
        if (!integer(player.playerId) || official.has(player.playerId))
          throw Error("Duplicate penalty context official player");
        official.set(player.playerId, clock(player.toi));
      }
    }
  const badToi = new Set<number>();
  for (const person of pbp.rosterSpots) {
    const reconstructed = intervals
        .filter((s) => s.playerId === person.playerId)
        .reduce((n, s) => n + s.end - s.start, 0),
      seconds = official.get(person.playerId),
      modelPlayer = game.players.find((p) => p.id === person.playerId);
    if (
      reconstructed > 0 &&
      (seconds === undefined ||
        !modelPlayer ||
        modelPlayer.team !== person.teamId ||
        (modelPlayer.position === "G") !== (person.positionCode === "G") ||
        Math.abs(modelPlayer.seconds - seconds) > 0.01 ||
        Math.abs(reconstructed - seconds) > Math.max(30, seconds * 0.03))
    )
      badToi.add(person.playerId);
  }
  const groupKeys = [
    ...new Set([
      ...native.map(
        (p) => `${p.periodDescriptor.number}:${clock(p.timeInPeriod)}`,
      ),
      ...rows
        .filter((r) => r.kind === "PENL")
        .map((r) => `${r.period}:${r.second}`),
    ]),
  ];
  for (const key of groupKeys) {
    const [period, second] = key.split(":").map(Number) as [number, number],
      absoluteSecond = (period - 1) * 1200 + second;
    const source = native
      .filter(
        (p) =>
          p.periodDescriptor.number === period &&
          clock(p.timeInPeriod) === second,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const primary = rows.filter(
      (r) => r.kind === "PENL" && r.period === period && r.second === second,
    );
    const relevant = source.filter((p) => ledger.has(p.eventId));
    const group: OfficialPenaltyContextGroupAudit = {
      period,
      second,
      absoluteSecond,
      nativeEventIds: source.map((p) => p.eventId),
      reportOrdinals: primary.map((p) => p.ordinal),
      status: "withheld",
      reasons: [],
      primaryRows: primary.map((p) => ({
        ordinal: p.ordinal,
        kind: p.kind,
        description: p.description,
        code: p.code,
      })),
    };
    audit.groups.push(group);
    if (!relevant.length) {
      group.status = "no-priced-sanctions";
      continue;
    }
    const orderedLedger = game.penalties.filter((p) =>
      source.some((s) => s.eventId === p.eventId),
    );
    if (orderedLedger.some((p, i) => p.eventId !== relevant[i]?.eventId))
      group.reasons.push("native-ledger-sanction-order-disagreement");
    if (unavailable.has(period))
      group.reasons.push("reviewed-period-event-source-unavailable");
    if (!primary.length || source.length !== primary.length)
      group.reasons.push("incomplete-whole-sanction-group");
    if (primary.some((p) => !p.away || !p.home))
      group.reasons.push("unverified-primary-lineup");
    const identities = primary.map((row) => reportIdentity(row, pbp));
    if (identities.some((value) => value === null))
      group.reasons.push("unverified-primary-sanction-identity-or-class");
    const assignment = new Map<number, number>();
    if (identities.every((value) => value !== null)) {
      const keys = [
        ...new Set(
          identities.map((p) => `${p!.teamId}:${p!.committedByPlayerId}`),
        ),
      ];
      for (const identityKey of keys) {
        const printed = identities
          .filter(
            (p) => `${p!.teamId}:${p!.committedByPlayerId}` === identityKey,
          )
          .map((p) => ({
            ...p!,
            typeCode:
              p!.duration === 4 && p!.typeCode === "DBL" ? "MIN" : p!.typeCode,
          }));
        const nativeGroup = source.filter(
          (p) =>
            `${p.details?.eventOwnerTeamId}:${p.details?.typeCode === "BEN" ? null : p.details?.committedByPlayerId}` ===
            identityKey,
        );
        if (
          nativeGroup.some(
            (p) =>
              p.details?.typeCode === "BEN" && p.details?.committedByPlayerId,
          )
        ) {
          group.reasons.push("bench-individual-committer-contradiction");
          continue;
        }
        try {
          const match = alignHistoricalPenaltyGroup(
            nativeGroup.map((p) => ({
              eventId: p.eventId,
              sortOrder: p.sortOrder,
              period,
              second,
              teamId: Number(p.details?.eventOwnerTeamId),
              committedByPlayerId:
                p.details?.typeCode === "BEN"
                  ? null
                  : Number(p.details?.committedByPlayerId),
              ...(p.details?.servedByPlayerId === undefined
                ? {}
                : {
                    servedByPlayerId: p.details.servedByPlayerId as
                      | number
                      | null,
                  }),
              duration: Number(p.details?.duration),
              typeCode:
                p.details?.typeCode === "DBL" && p.details?.duration === 4
                  ? "MIN"
                  : String(p.details?.typeCode),
              offence: String(p.details?.descKey).replace(
                /\s*\(maj\)\s*$/i,
                "",
              ),
            })),
            printed,
          );
          if (match.status !== "unique")
            group.reasons.push(`sanction-identity-${match.status}`);
          else
            for (const item of match.matches)
              assignment.set(item.ordinal, item.eventId);
        } catch {
          group.reasons.push("invalid-sanction-identity");
        }
      }
    }
    if (
      assignment.size !== primary.length ||
      new Set(assignment.values()).size !== source.length
    )
      group.reasons.push("whole-group-bijection-unverified");
    if (
      primary.some((p, i) => assignment.get(p.ordinal) !== source[i]?.eventId)
    )
      group.reasons.push("native-primary-sanction-order-disagreement");
    for (const row of group.primaryRows)
      row.eventId = assignment.get(row.ordinal);
    const first = primary[0],
      eventsAtClock = rows.filter(
        (p) => p.period === period && p.second === second,
      );
    if (!second) group.reasons.push("no-temporal-left-limit-at-period-zero");
    if (
      groupKeys.some((other) => {
        const [p, s] = other.split(":").map(Number);
        return other !== key && (p! - 1) * 1200 + s! === absoluteSecond;
      })
    )
      group.reasons.push("cross-period-absolute-clock-alias");
    if (
      first &&
      eventsAtClock.some(
        (p) => p.ordinal < first.ordinal && ["GOAL", "FAC"].includes(p.kind),
      )
    )
      group.reasons.push("goal-or-faceoff-before-sanctions-at-same-clock");
    if (
      first &&
      eventsAtClock.some(
        (p) =>
          p.ordinal > first.ordinal &&
          p.ordinal < primary.at(-1)!.ordinal &&
          p.kind !== "PENL",
      )
    )
      group.reasons.push("interleaved-whistle-or-model-event");
    if (
      first &&
      audit.unclockedControlRows?.some(
        (row) =>
          row.ordinal > first.ordinal && row.ordinal < primary.at(-1)!.ordinal,
      )
    )
      group.reasons.push("unclocked-control-within-sanction-group");
    if (invalidPeriods.has(period))
      group.reasons.push("unverified-period-shift-source");
    const active = intervals.filter(
      (s) =>
        s.period === period &&
        s.start < second &&
        s.end >= second &&
        s.end > s.start,
    );
    const selected = (team: number): Lineup | null => {
      const people = active.filter((s) => s.teamId === team),
        ids = people.map((p) => p.playerId);
      if (new Set(ids).size !== ids.length || ids.some((id) => badToi.has(id)))
        return null;
      const goalies = ids.filter(
          (id) =>
            pbp.rosterSpots.find((p) => p.playerId === id)!.positionCode ===
            "G",
        ).length,
        skaters = ids.length - goalies,
        normalized = skaters - Number(goalies === 0);
      return goalies <= 1 &&
        skaters + goalies <= 6 &&
        normalized >= 3 &&
        normalized <= 5
        ? { ids: ids.sort((a, b) => a - b), skaters, goalies, normalized }
        : null;
    };
    const away = selected(game.awayTeam),
      home = selected(game.homeTeam);
    if (!away || !home)
      group.reasons.push("unverified-left-limit-cohort-or-official-toi");
    else if (first?.away && first.home) {
      group.witness = {
        away,
        home,
        primaryAway: first.away,
        primaryHome: first.home,
        exactPlayerMembership:
          JSON.stringify(away.ids) === JSON.stringify(first.away.ids) &&
          JSON.stringify(home.ids) === JSON.stringify(first.home.ids),
      };
      if (
        away.normalized !== first.away.normalized ||
        home.normalized !== first.home.normalized
      )
        group.reasons.push("primary-left-limit-strength-disagreement");
    }
    const firstRelevant = primary.find((p) =>
      ledger.has(assignment.get(p.ordinal) ?? -1),
    );
    if (
      first &&
      firstRelevant &&
      first.ordinal !== firstRelevant.ordinal &&
      (first.away?.normalized !== firstRelevant.away?.normalized ||
        first.home?.normalized !== firstRelevant.home?.normalized)
    )
      group.reasons.push(
        "nonpriced-prior-sanction-changes-first-priced-context",
      );
    for (const row of primary) {
      const event = source.find(
        (p) => p.eventId === assignment.get(row.ordinal),
      );
      if (!event) continue;
      const identity = identities.find((p) => p?.ordinal === row.ordinal)!;
      const d = event.details!,
        committer =
          d.typeCode === "BEN"
            ? undefined
            : pbp.rosterSpots.find((p) => p.playerId === d.committedByPlayerId),
        drawn = pbp.rosterSpots.find((p) => p.playerId === d.drawnByPlayerId);
      if (
        (!committer && d.typeCode !== "BEN") ||
        (committer && committer.teamId !== d.eventOwnerTeamId) ||
        (drawn && drawn.teamId === d.eventOwnerTeamId) ||
        (d.drawnByPlayerId &&
          (!drawn || drawn.playerId !== identity.drawnByPlayerId))
      )
        group.reasons.push("native-sanction-actor-or-drawn-contradiction");
      const old = ledger.get(event.eventId);
      if (!old) continue;
      if (
        old.second !== absoluteSecond ||
        old.team !== d.eventOwnerTeamId ||
        old.minutes !== d.duration ||
        old.committed !== (committer?.playerId ?? null) ||
        old.drawn !== (drawn?.playerId ?? null)
      )
        group.reasons.push("native-ledger-assessment-facts-disagree");
      if ((old.homeBefore === null) !== (old.awayBefore === null))
        group.reasons.push("partial-native-strength-pair");
      if (event.situationCode !== undefined) {
        if (!/^[01][3-6][3-6][01]$/.test(event.situationCode))
          group.reasons.push("invalid-existing-native-strength");
        else {
          const nativeHome =
              Number(event.situationCode[2]) -
              Number(event.situationCode[3] === "0"),
            nativeAway =
              Number(event.situationCode[1]) -
              Number(event.situationCode[0] === "0");
          if (
            old.homeBefore !== nativeHome ||
            old.awayBefore !== nativeAway ||
            row.home?.normalized !== nativeHome ||
            row.away?.normalized !== nativeAway
          )
            group.reasons.push("known-native-strength-contradiction");
        }
      } else if (
        old.homeBefore !== null &&
        (old.homeBefore !== row.home?.normalized ||
          old.awayBefore !== row.away?.normalized)
      )
        group.reasons.push("known-ledger-strength-contradiction");
    }
    group.reasons = [...new Set(group.reasons)];
    if (group.reasons.length) continue;
    group.status = "native-preserved";
    for (const row of primary) {
      const old = ledger.get(assignment.get(row.ordinal)!);
      if (!old || old.homeBefore !== null || old.awayBefore !== null) continue;
      const after = {
        homeBefore: row.home!.normalized,
        awayBefore: row.away!.normalized,
      };
      const index = penalties.findIndex((p) => p.eventId === old.eventId);
      penalties[index] = { ...old, ...after };
      audit.changes.push({
        eventId: old.eventId,
        before: { homeBefore: old.homeBefore, awayBefore: old.awayBefore },
        after,
      });
      group.status = "recovered";
    }
  }
  const ledgerOrder = new Map(
    game.penalties.map((penalty, index) => [penalty.eventId, index]),
  );
  audit.changes.sort(
    (a, b) => ledgerOrder.get(a.eventId)! - ledgerOrder.get(b.eventId)!,
  );
  if (audit.changes.length) audit.status = "recovered";
  return { penalties, audit };
}

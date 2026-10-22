import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { OfficialShotCreditSources } from "./official-shot-credit-reconciliation";

type Obj = Record<string, unknown>;
const object = (v: unknown): Obj => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Invalid reviewed 2008 source object");
  return v as Obj;
};
const list = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw Error("Invalid reviewed 2008 population");
  return v;
};
const integer = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
    throw Error("Invalid reviewed 2008 count");
  return v;
};
const normalize = (v: unknown) =>
  String(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const abbr = (v: unknown) =>
  (({ NJ: "NJD", TB: "TBL", SJ: "SJS", LA: "LAK" }) as Record<string, string>)[
    normalize(v)
  ] ?? normalize(v);
const seconds = (v: unknown) => {
  if (typeof v !== "string" || !/^\d+:\d{2}$/.test(v))
    throw Error("Invalid reviewed 2008 clock");
  const [m, s] = v.split(":").map(Number);
  if (s! >= 60) throw Error("Invalid reviewed 2008 seconds");
  return m! * 60 + s!;
};
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const shotType = (v: unknown) =>
  (
    ({
      BACK: "backhand",
      DEFL: "deflected",
      TIP: "tip-in",
      WRAP: "wrap-around",
      TIPIN: "tip-in",
      WRAPAROUND: "wrap-around",
    }) as Record<string, string>
  )[normalize(v)] ?? String(v).toLowerCase();

export const REVIEWED_2008_SHOT_CREDIT_CASES = [
  [2008020157, 11038907, 8468535, 8459492, 138],
  [2008020347, 11050307, 8458229, 8466142, 172],
  [2008020640, 11067869, 8470358, 8470616, 120],
  [2008020820, 11078706, 8467439, 8470794, 40],
] as const;

/** A source-only precursor to the unchanged full historical bridge. The four
 * corrupt SHOT records duplicate the adjacent GOAL's actors. Replacement actors
 * are proved by primary report + raw archive + complete official populations.
 * No raw cache is changed and no geometry is supplied by this authority. */
export function repairReviewed2008ShotCredits(
  input: OfficialShotCreditSources,
) {
  const raw = object(JSON.parse(input.rawPbpText)),
    effective = object(input.effectivePbp),
    box = object(JSON.parse(input.boxscoreText)),
    gameId = integer(raw.id),
    spec = REVIEWED_2008_SHOT_CREDIT_CASES.find((r) => r[0] === gameId);
  if (
    !spec ||
    JSON.stringify(raw) !== JSON.stringify(effective) ||
    raw.gameType !== 2 ||
    raw.gameState !== "OFF" ||
    box.id !== gameId ||
    box.gameDate !== raw.gameDate ||
    input.providerArchive.url !==
      "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip" ||
    !/^[a-f0-9]{64}$/.test(input.providerArchive.sha256)
  )
    throw Error("Unsupported reviewed 2008 pre-bridge scope");
  const home = object(raw.homeTeam),
    away = object(raw.awayTeam),
    roster = list(raw.rosterSpots).map(object),
    events = list(raw.plays).map(object);
  if (
    new Set(roster.map((p) => integer(p.playerId))).size !== roster.length ||
    new Set(events.map((e) => integer(e.eventId))).size !== events.length
  )
    throw Error("Duplicate reviewed 2008 identity");
  for (const side of ["homeTeam", "awayTeam"]) {
    const n = object(raw[side]),
      b = object(box[side]);
    if (n.id !== b.id || n.abbrev !== b.abbrev || n.score !== b.score)
      throw Error("Reviewed 2008 box team/score differs");
  }
  const team = (value: unknown) =>
    abbr(value) === abbr(home.abbrev)
      ? home.id
      : abbr(value) === abbr(away.abbrev)
        ? away.id
        : undefined;
  const person = (side: unknown, jersey: number, name?: string) => {
    const p = roster.filter(
      (p) =>
        p.teamId === side &&
        p.sweaterNumber === jersey &&
        (name === undefined ||
          normalize(object(p.lastName).default) === normalize(name)),
    );
    if (p.length !== 1)
      throw Error("Reviewed 2008 report person is not unique");
    return p[0]!;
  };
  const fullDate = new Date(
    String(raw.gameDate) + "T12:00:00Z",
  ).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const report = (html: string, title: string) => {
    const q = load(html),
      rows = q("tr")
        .toArray()
        .map((tr) =>
          q(tr)
            .children("td")
            .toArray()
            .map((td) => q(td).text().replace(/\s+/g, " ").trim()),
        ),
      logos = q("img")
        .toArray()
        .map(
          (i) =>
            q(i)
              .attr("src")
              ?.match(/logoc([a-z]+)\.gif/i)?.[1],
        )
        .filter((s) => s !== undefined && normalize(s) !== "NHL");
    if (
      q("title").text().trim() !== title ||
      !rows.flat().includes(fullDate) ||
      !rows
        .flat()
        .some((s) =>
          new RegExp(`^(?:Match/)?Game\\s+0*${gameId % 10000}$`).test(s),
        ) ||
      !logos.length ||
      logos.length % 2 ||
      logos.some(
        (s, i) => abbr(s) !== abbr(i % 2 ? home.abbrev : away.abbrev),
      ) ||
      !rows.some(
        (r) =>
          r.length === 3 &&
          Number(r[0]!.match(/^VISITOR\s+(\d+)\b/)?.[1]) === away.score &&
          Number(r[2]!.match(/^HOME\s+(\d+)\b/)?.[1]) === home.score,
      )
    )
      throw Error("Wrong reviewed 2008 primary report identity");
    return rows;
  };
  const pl = report(input.playReportHtml, "Play By Play"),
    gs = report(input.gameSummaryHtml, "Game Summary"),
    physical: Array<{
      ordinal: number;
      period: number;
      second: number;
      kind: string;
      shooter: number;
      goalie: number;
      team: unknown;
      shotType: string;
      description: string;
    }> = [];
  const lineup = (value: string, side: unknown) => {
    const people = [...value.matchAll(/\b(\d{1,2})\s+([CDLRWG]{1,2})\b/g)].map(
      (m) => {
        const p = person(side, Number(m[1]));
        if ((p.positionCode === "G") !== (m[2] === "G"))
          throw Error("Reviewed 2008 report role differs");
        return p;
      },
    );
    if (
      new Set(people.map((p) => p.playerId)).size !== people.length ||
      people.filter((p) => p.positionCode === "G").length > 1
    )
      throw Error("Invalid reviewed 2008 lineup");
    return {
      goalie: people.find((p) => p.positionCode === "G")?.playerId ?? 0,
      skaters: people.filter((p) => p.positionCode !== "G").length,
    };
  };
  for (const r of pl) {
    if (
      r.length !== 8 ||
      !/^\d+$/.test(r[0]!) ||
      !/^\d+$/.test(r[1]!) ||
      Number(r[1]) > 4 ||
      !["SHOT", "GOAL", "MISS"].includes(r[4]!)
    )
      continue;
    const ordinal = Number(r[0]),
      period = Number(r[1]),
      second = seconds(r[3]!.match(/^\d+:\d{2}/)?.[0]),
      owner = team(r[5]!.split(" ")[0]),
      label = r[5]!.match(/#(\d+)\s+([^,]+)/);
    if (owner === undefined || !label)
      throw Error("Missing reviewed 2008 primary shot actor");
    const p = person(
        owner,
        Number(label[1]),
        label[2]!.replace(/\([^)]*\)/g, "").trim(),
      ),
      h = lineup(r[7]!, home.id),
      a = lineup(r[6]!, away.id),
      g = owner === home.id ? a : h,
      archive = input.providerRows.filter(
        (m) => m.gameId === gameId && m.ordinal === ordinal,
      );
    if (archive.length !== 1)
      throw Error("Reviewed 2008 archive cardinality differs");
    const m = archive[0]!,
      printed = r[5]!.match(
        /,\s*(Wrist|Backhand|Slap|Snap|Tip-In|Deflected|Wrap-around)\b/i,
      )?.[1];
    if (
      period < 1 ||
      second > (period === 4 ? 300 : 1200) ||
      m.kind !== r[4] ||
      m.period !== period ||
      m.second !== second ||
      m.shooter !== p.playerId ||
      m.goalie !== g.goalie ||
      m.home !== (owner === home.id) ||
      m.homeSkaters !== h.skaters ||
      m.awaySkaters !== a.skaters ||
      m.homeGoalie !== Boolean(h.goalie) ||
      m.awayGoalie !== Boolean(a.goalie) ||
      (printed && shotType(printed) !== shotType(m.shotType))
    )
      throw Error("Reviewed 2008 primary/archive physical facts differ");
    physical.push({
      ordinal,
      period,
      second,
      kind: r[4]!,
      shooter: integer(p.playerId),
      goalie: integer(g.goalie),
      team: owner,
      shotType: shotType(printed ?? m.shotType),
      description: r[5]!,
    });
  }
  if (
    !physical.length ||
    new Set(physical.map((e) => e.ordinal)).size !== physical.length ||
    physical.length !== input.providerRows.length ||
    input.providerRows.some(
      (m) =>
        m.gameId !== gameId ||
        physical.filter((e) => e.ordinal === m.ordinal).length !== 1,
    )
  )
    throw Error("Reviewed 2008 full archive/primary population differs");
  const targets = events.filter((e) => e.eventId === spec[1]),
    primaries = physical.filter((e) => e.ordinal === spec[4]);
  if (targets.length !== 1 || primaries.length !== 1)
    throw Error("Reviewed 2008 exact source slot is missing");
  const original = targets[0]!,
    primary = primaries[0]!,
    old = object(original.details),
    period = object(original.periodDescriptor);
  if (
    original.typeDescKey !== "shot-on-goal" ||
    period.periodType === "SO" ||
    period.number !== primary.period ||
    seconds(original.timeInPeriod) !== primary.second ||
    old.shootingPlayerId !== spec[2] ||
    primary.kind !== "SHOT" ||
    primary.shooter !== spec[3] ||
    old.xCoord !== undefined ||
    old.yCoord !== undefined ||
    events.filter(
      (e) =>
        e.typeDescKey === "shot-on-goal" &&
        object(e.periodDescriptor).number === primary.period &&
        seconds(e.timeInPeriod) === primary.second,
    ).length !== 1 ||
    physical.filter(
      (e) =>
        e.kind === "SHOT" &&
        e.period === primary.period &&
        e.second === primary.second,
    ).length !== 1
  )
    throw Error("Reviewed 2008 wrong-credit source signature differs");
  const sort = integer(original.sortOrder),
    adjacent = events.filter(
      (e) =>
        e.typeDescKey === "goal" &&
        object(e.periodDescriptor).number === primary.period &&
        seconds(e.timeInPeriod) === primary.second &&
        object(e.details).scoringPlayerId === old.shootingPlayerId &&
        object(e.details).eventOwnerTeamId === old.eventOwnerTeamId &&
        e.sortOrder === sort - 1,
    );
  if (adjacent.length !== 1)
    throw Error("Reviewed 2008 copied adjacent GOAL signature differs");
  const id = 1500000000 + primary.ordinal;
  if (events.some((e) => e.eventId === id))
    throw Error("Reviewed 2008 derived identity collision");
  const replacement = {
    eventId: id,
    sortOrder: sort,
    typeCode: 506,
    typeDescKey: "shot-on-goal",
    periodDescriptor: structuredClone(original.periodDescriptor),
    timeInPeriod: original.timeInPeriod,
    ...(original.timeRemaining !== undefined
      ? { timeRemaining: original.timeRemaining }
      : {}),
    details: {
      eventOwnerTeamId: primary.team,
      shootingPlayerId: primary.shooter,
      ...(primary.goalie ? { goalieInNetId: primary.goalie } : {}),
      shotType: primary.shotType,
      nhlReviewedPreBridgeCredit: "primary-derived-not-native-event-identity",
    },
  };
  const output = {
      ...structuredClone(raw),
      plays: events.map((e) =>
        e.eventId === spec[1] ? replacement : structuredClone(e),
      ),
    },
    onGoal = output.plays.filter(
      (e) =>
        object(e.periodDescriptor).periodType !== "SO" &&
        ["goal", "shot-on-goal"].includes(String(e.typeDescKey)),
    );
  // Every unchanged native on-goal identity must be corroborated, including all
  // GOALs. Equal multiplicities retain genuine same-clock repeated attempts.
  const key = (p: {
      period: number;
      second: number;
      kind: string;
      shooter: number;
      goalie: number;
      team: unknown;
    }) =>
      JSON.stringify([p.period, p.second, p.kind, p.shooter, p.goalie, p.team]),
    primaryCounts = new Map<string, number>(),
    nativeCounts = new Map<string, number>();
  for (const p of physical.filter((p) => p.kind !== "MISS")) {
    const k = key(p);
    primaryCounts.set(k, (primaryCounts.get(k) ?? 0) + 1);
  }
  for (const e of onGoal) {
    const d = object(e.details),
      k = key({
        period: integer(object(e.periodDescriptor).number),
        second: seconds(e.timeInPeriod),
        kind: e.typeDescKey === "goal" ? "GOAL" : "SHOT",
        shooter: integer(d.shootingPlayerId ?? d.scoringPlayerId),
        goalie: integer(d.goalieInNetId ?? 0),
        team: d.eventOwnerTeamId,
      });
    nativeCounts.set(k, (nativeCounts.get(k) ?? 0) + 1);
  }
  if (
    primaryCounts.size !== nativeCounts.size ||
    [...primaryCounts].some(([k, n]) => nativeCounts.get(k) !== n)
  )
    throw Error(
      "Reviewed 2008 corrected native/primary full identity ledger differs",
    );
  const scored = gs
    .filter(
      (r) =>
        r.length === 10 &&
        /^\d+$/.test(r[0]!) &&
        (/^\d+$/.test(r[1]!) || r[1] === "OT") &&
        (r[1] === "OT" || Number(r[1]) <= 4),
    )
    .map((r) => {
      const side = team(r[4]),
        label = r[5]!.match(/^(\d+)\s+(.+?)\(/);
      if (side === undefined || !label)
        throw Error("Invalid reviewed 2008 GS scorer");
      const p = person(side, Number(label[1]));
      if (!normalize(label[2]).endsWith(normalize(object(p.lastName).default)))
        throw Error("Reviewed 2008 GS scorer name differs");
      return {
        period: r[1] === "OT" ? 4 : Number(r[1]),
        second: seconds(r[2]),
        shooter: integer(p.playerId),
        team: side,
      };
    });
  const goals = physical.filter((p) => p.kind === "GOAL");
  if (
    scored.length !== goals.length ||
    goals.some(
      (p) =>
        scored.filter(
          (g) =>
            g.period === p.period &&
            g.second === p.second &&
            g.shooter === p.shooter &&
            g.team === p.team,
        ).length !== 1,
    )
  )
    throw Error("Reviewed 2008 full GS goal ledger differs");
  const counts: Obj[] = [],
    population = new Map<number, { team: unknown; goalie: boolean }>();
  for (const side of ["homeTeam", "awayTeam"]) {
    const t = object(raw[side]),
      stats = object(object(box.playerByGameStats)[side]);
    if (
      onGoal.filter((e) => object(e.details).eventOwnerTeamId === t.id)
        .length !== integer(object(box[side]).sog)
    )
      throw Error("Reviewed 2008 team SOG differs");
    for (const group of ["forwards", "defense", "goalies"]) {
      for (const p of list(stats[group]).map(object)) {
        const id = integer(p.playerId),
          goalie = group === "goalies";
        if (
          population.has(id) ||
          roster.filter(
            (r) =>
              r.playerId === id &&
              r.teamId === t.id &&
              (r.positionCode === "G") === goalie,
          ).length !== 1
        )
          throw Error("Reviewed 2008 official person identity differs");
        population.set(id, { team: t.id, goalie });
        const mine = onGoal.filter((e) => {
          const d = object(e.details);
          return goalie
            ? d.goalieInNetId === id
            : (d.shootingPlayerId ?? d.scoringPlayerId) === id;
        });
        if (
          goalie &&
          p.shotsAgainst === undefined &&
          p.goalsAgainst === undefined &&
          p.toi === undefined &&
          p.starter === false
        ) {
          if (mine.length)
            throw Error("Reviewed 2008 unconfirmed backup has native exposure");
          counts.push({
            playerId: id,
            goalie,
            officialOnGoal: null,
            observedOnGoal: 0,
            officialGoals: null,
            observedGoals: 0,
            sourceStatus: "unconfirmed-backup-no-stats",
          });
          continue;
        }
        const official = integer(goalie ? p.shotsAgainst : p.sog),
          g = integer(goalie ? p.goalsAgainst : p.goals),
          actual = mine.filter((e) => e.typeDescKey === "goal").length;
        if (mine.length !== official || actual !== g)
          throw Error("Reviewed 2008 all-person SOG/SA/G/GA differs");
        counts.push({
          playerId: id,
          goalie,
          officialOnGoal: official,
          observedOnGoal: mine.length,
          officialGoals: g,
          observedGoals: actual,
        });
      }
    }
  }
  if (
    onGoal.some((e) => {
      const d = object(e.details),
        s = population.get(Number(d.shootingPlayerId ?? d.scoringPlayerId)),
        g = population.get(Number(d.goalieInNetId));
      return (
        !s ||
        s.team !== d.eventOwnerTeamId ||
        (Number(d.goalieInNetId) > 0 &&
          (!g || !g.goalie || g.team === d.eventOwnerTeamId))
      );
    })
  )
    throw Error("Reviewed 2008 full ledger own/opponent role differs");
  return {
    pbp: output,
    proof: {
      version: "nhl-reviewed-2008-prebridge-credit-v1" as const,
      gameId,
      date: raw.gameDate,
      rawPbpSha256: hash(input.rawPbpText),
      preOverlayPbpSha256: hash(JSON.stringify(effective)),
      outputSha256: hash(JSON.stringify(output)),
      playReportSha256: hash(input.playReportHtml),
      gameSummarySha256: hash(input.gameSummaryHtml),
      boxscoreSha256: hash(input.boxscoreText),
      providerArchive: { ...input.providerArchive },
      originalRecord: structuredClone(original),
      replacement: structuredClone(replacement),
      primary,
      originalNativeRecords: structuredClone(events),
      counts,
      requiresHistoricalBridge: true,
      geometrySupplied: false,
      providerProbabilitiesUsed: false,
      interpretation:
        "One independently proven corrupt native SHOT slot is replaced by an explicitly primary-derived identity. Original records remain intact in this evidence. Geometry remains absent; the complete unchanged historical bridge must subsequently verify chronology and raw features before valuation. Every other native event is unchanged, and every on-goal actor/group plus GS goals and fresh official SOG/SA/G/GA reconcile exactly.",
    },
  };
}

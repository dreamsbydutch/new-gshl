import { load } from "cheerio";
import { clockSeconds } from "./game-value-input";
import {
  bridgeHistoricalShotSource,
  type HistoricalRawShot,
  type HistoricalShotProvenance,
} from "./historical-shot-source-bridge";

type Play = {
  eventId: number;
  sortOrder?: number;
  typeDescKey: string;
  periodDescriptor: { number: number; periodType: string };
  timeInPeriod: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
};
type Game = {
  id: number;
  gameType: number;
  gameState: string;
  gameDate: string;
  homeTeam: { id: number; abbrev: string; score: number };
  awayTeam: { id: number; abbrev: string; score: number };
  rosterSpots: Array<{
    playerId: number;
    teamId: number;
    sweaterNumber: number;
    positionCode: string;
    lastName: { default: string };
  }>;
  plays: Play[];
};
type Box = {
  id: number;
  gameDate: string;
  homeTeam: { id: number; abbrev: string; sog: number; score: number };
  awayTeam: { id: number; abbrev: string; sog: number; score: number };
  playerByGameStats: Record<
    string,
    {
      forwards: Array<Record<string, unknown>>;
      defense: Array<Record<string, unknown>>;
      goalies: Array<Record<string, unknown>>;
    }
  >;
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const originalIds = [
  174, 360, 922, 1684, 1846, 2084, 2629, 147802, 147803, 147804, 147805, 147806,
  147807, 147808,
];

/** One reviewed sparse native feed only. Missing SOG identities come from the
 * primary official report; the unchanged bridge independently joins every raw
 * geometry/manpower tuple. These records are never represented as native PBP. */
export function bridgeMissingNativeShotSource(
  raw: unknown,
  rows: HistoricalRawShot[],
  html: string,
  rawBox: unknown,
  provenance: HistoricalShotProvenance,
  officialBox: { url: string; sha256: string },
) {
  const game = raw as Game,
    box = rawBox as Box;
  if (
    game.id !== 2009020714 ||
    game.gameType !== 2 ||
    game.gameState !== "OFF" ||
    game.gameDate !== "2010-01-16" ||
    game.homeTeam.id !== 13 ||
    game.homeTeam.abbrev !== "FLA" ||
    game.homeTeam.score !== 5 ||
    game.awayTeam.id !== 14 ||
    game.awayTeam.abbrev !== "TBL" ||
    game.awayTeam.score !== 2 ||
    box.id !== game.id ||
    box.gameDate !== game.gameDate ||
    box.homeTeam.id !== 13 ||
    box.awayTeam.id !== 14 ||
    box.homeTeam.abbrev !== "FLA" ||
    box.awayTeam.abbrev !== "TBL" ||
    box.homeTeam.score !== 5 ||
    box.awayTeam.score !== 2 ||
    box.homeTeam.sog !== 23 ||
    box.awayTeam.sog !== 49 ||
    officialBox.url !==
      "https://api-web.nhle.com/v1/gamecenter/2009020714/boxscore" ||
    !/^[a-f0-9]{64}$/.test(officialBox.sha256) ||
    !Array.isArray(game.plays) ||
    game.plays.length !== 14 ||
    new Set(game.plays.map((p) => p.eventId)).size !== 14 ||
    originalIds.some((id) => !game.plays.some((p) => p.eventId === id)) ||
    game.plays.filter((p) => p.typeDescKey === "goal").length !== 7 ||
    game.plays.filter((p) => p.typeDescKey === "penalty").length !== 7 ||
    game.plays.some(
      (p) =>
        p.periodDescriptor.periodType !== "REG" ||
        !Number.isInteger(p.periodDescriptor.number) ||
        p.periodDescriptor.number < 1 ||
        p.periodDescriptor.number > 3 ||
        clockSeconds(p.timeInPeriod) < 0 ||
        clockSeconds(p.timeInPeriod) > 1200,
    )
  )
    throw Error("Unsupported reviewed missing-native SOG scope");
  const page = load(html),
    clean = (s: string) => s.replace(/\s+/g, " ").trim(),
    cells = page("td")
      .toArray()
      .map((td) => clean(page(td).text()));
  if (
    page("title").text().trim() !== "Play By Play" ||
    !cells.includes("Saturday, January 16, 2010") ||
    !cells.some((s) => /^(?:Match\/)?Game\s+0*714$/.test(s))
  )
    throw Error("Wrong missing-native SOG official report identity");
  if (
    new Set(game.rosterSpots.map((p) => p.playerId)).size !==
      game.rosterSpots.length ||
    game.rosterSpots.some(
      (p) =>
        !integer(p.playerId) ||
        p.playerId === 0 ||
        ![13, 14].includes(p.teamId),
    )
  )
    throw Error("Invalid missing-native SOG canonical roster");
  const added: Play[] = [],
    ordinals = new Set<number>();
  page("tr").each((_, tr) => {
    const f = page(tr)
      .children("td")
      .toArray()
      .map((td) => clean(page(td).text()));
    if (f.length !== 8 || f[4] !== "SHOT") return;
    const m = f[5]!.match(/^([A-Z.]+) ONGOAL - #(\d+)\s+([^,]+),/),
      clock = f[3]!.match(/^(\d+:\d{2})/),
      ordinal = Number(f[0]),
      period = Number(f[1]);
    if (
      !m ||
      !clock ||
      !Number.isSafeInteger(ordinal) ||
      ordinal < 1 ||
      ordinals.has(ordinal) ||
      !Number.isSafeInteger(period) ||
      period < 1 ||
      period > 3 ||
      clockSeconds(clock[1]) < 0 ||
      clockSeconds(clock[1]) > 1200
    )
      throw Error("Invalid or duplicate missing-native SOG report row");
    ordinals.add(ordinal);
    const abbr = norm(m[1]!) === "TB" ? "TBL" : norm(m[1]!),
      team = abbr === "FLA" ? 13 : abbr === "TBL" ? 14 : 0,
      roster = game.rosterSpots.filter(
        (p) => p.teamId === team && p.sweaterNumber === Number(m[2]),
      );
    if (
      roster.length !== 1 ||
      roster[0]!.positionCode === "G" ||
      norm(roster[0]!.lastName.default) !== norm(m[3]!)
    )
      throw Error(
        "Missing-native SOG official actor is not uniquely canonical",
      );
    const eventId = 1000000000 + ordinal;
    if (game.plays.some((p) => p.eventId === eventId))
      throw Error("Missing-native SOG derived ID collision");
    added.push({
      eventId,
      sortOrder: ordinal,
      periodDescriptor: { number: period, periodType: "REG" },
      timeInPeriod: clock[1],
      typeDescKey: "shot-on-goal",
      details: {
        eventOwnerTeamId: team,
        shootingPlayerId: roster[0]!.playerId,
        nhlOfficialDerivedEvent: "reviewed-missing-native-on-goal-v1",
      },
    });
  });
  if (added.length !== 65)
    throw Error("Reviewed missing-native SOG count changed");
  const result = bridgeHistoricalShotSource(
    { ...game, plays: [...game.plays, ...added] },
    rows,
    html,
    provenance,
  );
  const onGoal = result.pbp.plays.filter(
    (p) =>
      p.periodDescriptor.periodType !== "SO" &&
      ["goal", "shot-on-goal"].includes(p.typeDescKey),
  );
  const nativeSortRecovery: Array<{
    eventId: number;
    original: unknown;
    reportSortOrder: unknown;
  }> = [];
  for (const original of game.plays) {
    const found = result.pbp.plays.filter(
      (p) => p.eventId === original.eventId,
    );
    if (found.length !== 1)
      throw Error("Reviewed missing-native SOG lost original event");
    for (const [key, value] of Object.entries(original)) {
      if (key === "sortOrder") continue;
      if (key === "details") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>))
          if (JSON.stringify(found[0]!.details?.[k]) !== JSON.stringify(v))
            throw Error("Reviewed missing-native SOG changed native detail");
      } else if (
        JSON.stringify((found[0] as Record<string, unknown>)[key]) !==
        JSON.stringify(value)
      )
        throw Error("Reviewed missing-native SOG changed native event");
    }
    if (original.sortOrder !== found[0]!.sortOrder)
      nativeSortRecovery.push({
        eventId: original.eventId,
        original: original.sortOrder ?? null,
        reportSortOrder: found[0]!.sortOrder,
      });
  }
  const teamCounts: Array<Record<string, number | string>> = [],
    playerCounts: Array<Record<string, number>> = [],
    goalieCounts: Array<Record<string, number>> = [],
    boxIds = new Set<number>();
  for (const [side, team] of [
    ["homeTeam", box.homeTeam],
    ["awayTeam", box.awayTeam],
  ] as const) {
    const stats = box.playerByGameStats[side];
    if (
      !stats ||
      !Array.isArray(stats.forwards) ||
      !Array.isArray(stats.defense) ||
      !Array.isArray(stats.goalies)
    )
      throw Error("Missing reviewed official box population");
    const own = onGoal.filter((p) => p.details?.eventOwnerTeamId === team.id),
      goals = own.filter((p) => p.typeDescKey === "goal");
    if (own.length !== team.sog || goals.length !== team.score)
      throw Error("Reviewed missing-native SOG team counts differ");
    teamCounts.push({
      side,
      officialSog: team.sog,
      verifiedSog: own.length,
      officialGoals: team.score,
      verifiedGoals: goals.length,
    });
    for (const [group, people] of [
      ["skater", [...stats.forwards, ...stats.defense]],
      ["goalie", stats.goalies],
    ] as const)
      for (const p of people) {
        const id = p.playerId;
        if (
          !integer(id) ||
          id === 0 ||
          boxIds.has(id) ||
          game.rosterSpots.filter(
            (r) =>
              r.playerId === id &&
              r.teamId === team.id &&
              (r.positionCode === "G") === (group === "goalie"),
          ).length !== 1
        )
          throw Error("Reviewed official box identity/role mismatch");
        boxIds.add(id);
        if (group === "skater") {
          const sog = own.filter(
              (e) =>
                Number(
                  e.details?.shootingPlayerId ?? e.details?.scoringPlayerId,
                ) === id,
            ).length,
            g = goals.filter((e) => e.details?.scoringPlayerId === id).length;
          if (
            !integer(p.sog) ||
            !integer(p.goals) ||
            p.sog !== sog ||
            p.goals !== g
          )
            throw Error("Reviewed missing-native SOG skater counts differ");
          playerCounts.push({
            playerId: id,
            officialSog: p.sog,
            verifiedSog: sog,
            officialGoals: p.goals,
            verifiedGoals: g,
          });
        } else {
          const sa = onGoal.filter(
              (e) => e.details?.goalieInNetId === id,
            ).length,
            ga = onGoal.filter(
              (e) =>
                e.typeDescKey === "goal" && e.details?.goalieInNetId === id,
            ).length;
          if (
            !integer(p.shotsAgainst) ||
            !integer(p.goalsAgainst) ||
            p.shotsAgainst !== sa ||
            p.goalsAgainst !== ga
          )
            throw Error("Reviewed missing-native SOG goalie counts differ");
          goalieCounts.push({
            playerId: id,
            officialSA: p.shotsAgainst,
            verifiedSA: sa,
            officialGA: p.goalsAgainst,
            verifiedGA: ga,
          });
        }
      }
  }
  if (
    playerCounts.reduce((n, p) => n + p.verifiedSog!, 0) !== 72 ||
    goalieCounts.reduce((n, p) => n + p.verifiedSA!, 0) !== 72
  )
    throw Error("Reviewed missing-native SOG complete population differs");
  return {
    ...result,
    audit: {
      ...result.audit,
      reviewedMissingOnGoal: {
        version: "nhl-reviewed-missing-native-on-goal-v1",
        originalRawPbpSha256: provenance.officialPbpSha256,
        originalNativeEventCount: 14,
        originalNativeEventIds: game.plays.map((p) => p.eventId),
        primaryOfficialReportSha256: provenance.officialPlayReportSha256,
        officialBox: { ...officialBox },
        reportDerivedOnGoalEventIds: added.map((p) => p.eventId),
        reportDerivedOnGoalOrdinals: added.map((p) => p.sortOrder!),
        derivedIdentitySource:
          "official-HTML-report-only; never native-PBP or provider-derived identity",
        rawGeometrySource:
          "unchanged independent provider-to-official-report bridge",
        nativeSortRecovery,
        teamCounts,
        playerCounts,
        goalieCounts,
        interpretation:
          "Exactly65 missing native SOG identities restored from the primary official report; original14 native events retain every existing fact except independently recovered report ordering. Coordinates, goalie and manpower are absent from seeds and are priced only through the unchanged strict raw-source bridge. Full72SOG/7GOAL and every official skater/goalie count conserved; no provider probabilities.",
      },
    },
  };
}

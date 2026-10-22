import { createHash } from "node:crypto";
import { load } from "cheerio";

export type OnGoalOfficialGameRow = {
  gameId: number;
  date: string;
  playerId: number;
  teamId: number;
  position: "F" | "D" | "G";
  gamesPlayed: 1;
  goals: number;
  onGoal: number;
};
export type OnGoalClassificationEvent = {
  eventId: number;
  period: number;
  second: number;
  kind: "SHOT" | "MISS" | "GOAL";
  shooter: number;
  goalie: number;
  nativeGoalieInNetId: number | null;
  resolvedPrimaryGoalie: number | null;
  nativeGeometry: {
    xCoord?: number;
    yCoord?: number;
    shotType?: string;
    zoneCode?: string;
    situationCode?: string;
  };
};
export type OnGoalClassificationHashes = {
  pbpSha256: string;
  htmlSha256: string;
  boxSha256: string;
  officialSummarySha256: string;
};
type Group = {
  playerId: number;
  position: "F" | "D" | "G";
  officialOnGoalAttempts: number;
  primaryLabeledOnGoalAttempts: number;
  officialGoals: number;
  events: OnGoalClassificationEvent[];
};
export type OfficialOnGoalClassificationProof = {
  version: "nhl-official-on-goal-classification-conflict-v1";
  gameId: number;
  date: string;
  sourceHashes: OnGoalClassificationHashes;
  groups: Group[];
  unorderedPrimaryIdentityGroups: Array<{
    nativeEventIds: number[];
    primaryOrdinals: number[];
    commonKey: {
      period: number;
      second: number;
      kind: string;
      shooter: number;
      goalie: number;
      situation: string;
    };
    primaryRows: unknown[];
    interpretation: string;
  }>;
  unrelatedContextDiscrepancies: Array<{
    ordinal: number;
    period: number;
    second: number;
    shooter: number;
    rawAwayLineup: string;
    rawHomeLineup: string;
    reason: string;
  }>;
  unrelatedMissingExposure: Array<{
    playerId: number;
    position: "F" | "D" | "G";
    missingGoals: number;
    missingPrimaryOnGoalAttempts: number;
    missingPhysicalAttempts: number;
  }>;
  unplayedFreshBoxGoalies?: Array<{
    teamId: number;
    playerId: number;
    originalRecord: Record<string, unknown>;
    interpretation: string;
  }>;
  interpretation: string;
};
export type ReviewedOnGoalClassificationGroup = Group & {
  gameId: number;
  date: string;
  sourceHashes: OnGoalClassificationHashes;
  proofSha256: string;
  groupSha256: string;
};
export const REVIEWED_ON_GOAL_CLASSIFICATION_GAMES = [
  { gameId: 2008020084, playerIds: [8470041] },
  { gameId: 2008020301, playerIds: [8456464] },
  { gameId: 2008020363, playerIds: [8468704] },
  { gameId: 2008020454, playerIds: [8470597] },
  { gameId: 2008020470, playerIds: [8469485, 8467391] },
  { gameId: 2008020681, playerIds: [8467878, 8460712] },
  { gameId: 2008021129, playerIds: [8471634, 8471403] },
  { gameId: 2009020213, playerIds: [8462042, 8462152] },
  { gameId: 2009020134, playerIds: [8466139, 8460704] },
  { gameId: 2009021188, playerIds: [8467493, 8460712] },
  { gameId: 2009020539, playerIds: [8469622] },
  { gameId: 2009020153, playerIds: [8471234] },
  { gameId: 2009021126, playerIds: [8471245, 8473461] },
  { gameId: 2009020566, playerIds: [8471691, 8471734] },
  { gameId: 2009020862, playerIds: [8475169] },
  { gameId: 2010021209, playerIds: [8467988, 8466339] },
  { gameId: 2010020748, playerIds: [8469664, 8469152] },
  { gameId: 2010021015, playerIds: [8469707] },
  { gameId: 2010020296, playerIds: [8470104] },
  { gameId: 2011021153, playerIds: [8470621] },
  { gameId: 2011020672, playerIds: [8471339] },
  { gameId: 2011020123, playerIds: [8471504] },
  { gameId: 2011020742, playerIds: [8473618, 8464999] },
  { gameId: 2011021166, playerIds: [8474705, 8462147] },
  { gameId: 2012020404, playerIds: [8468509, 8471227] },
  { gameId: 2012020367, playerIds: [8468518, 8469514] },
  { gameId: 2012020580, playerIds: [8469465] },
  { gameId: 2012020268, playerIds: [8474628, 8469732] },
] as const;
const allowedGames = new Set<number>(
  REVIEWED_ON_GOAL_CLASSIFICATION_GAMES.map((g) => g.gameId),
);
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const teamCode = (value: string) =>
  (({ TB: "TBL", SJ: "SJS", LA: "LAK", NJ: "NJD" }) as Record<string, string>)[
    norm(value)
  ] ?? norm(value);
const seconds = (value: string) => {
  const match = value.match(/^(\d{1,2}):([0-5]\d)/);
  if (!match) throw Error("Invalid classification clock");
  return Number(match[1]) * 60 + Number(match[2]);
};
const kind = (value: string) =>
  (
    ({
      "shot-on-goal": "SHOT",
      "missed-shot": "MISS",
      goal: "GOAL",
    }) as Record<string, string>
  )[value] as OnGoalClassificationEvent["kind"] | undefined;
type Game = {
  id: number;
  gameDate: string;
  homeTeam: { id: number; abbrev: string; score: number };
  awayTeam: { id: number; abbrev: string; score: number };
  rosterSpots: Array<{
    playerId: number;
    teamId: number;
    sweaterNumber: number;
    positionCode: string;
    lastName: { default: string };
    firstName?: { default: string };
  }>;
  plays: Array<{
    eventId: number;
    sortOrder: number;
    typeDescKey: string;
    periodDescriptor: { number: number; periodType: string };
    timeInPeriod: string;
    situationCode?: string;
    details?: Record<string, unknown>;
  }>;
};

/** Source facts are replayed at the IO boundary. This proof never changes a play,
 * invents a SOG identity, or selects which physical attempt has another stat label. */
export function parseOfficialOnGoalClassification(
  html: string,
  raw: unknown,
  freshBox: unknown,
  officialRows: readonly OnGoalOfficialGameRow[],
  playerIds: readonly number[],
  sourceHashes: OnGoalClassificationHashes,
): OfficialOnGoalClassificationProof {
  const requestedGameId = (raw as { id?: number })?.id;
  const scope = REVIEWED_ON_GOAL_CLASSIFICATION_GAMES.find(
    (s) => s.gameId === requestedGameId,
  );
  if (
    !scope ||
    playerIds.length !== scope.playerIds.length ||
    !scope.playerIds.every((id) => playerIds.includes(id))
  )
    throw Error("Classification player selection outside reviewed scope");
  const game = raw as Game,
    box = freshBox as {
      id: number;
      gameDate: string;
      homeTeam: { id: number; score: number };
      awayTeam: { id: number; score: number };
      playerByGameStats: Record<
        string,
        Record<string, Array<Record<string, unknown>>>
      >;
    };
  if (
    !allowedGames.has(game.id) ||
    !Object.values(sourceHashes).every(isHash) ||
    Object.keys(sourceHashes).length !== 4 ||
    !playerIds.length ||
    new Set(playerIds).size !== playerIds.length ||
    !officialRows.length ||
    game.rosterSpots.length > 80 ||
    game.plays.length > 2000
  )
    throw Error("Invalid classification proof scope/hash/population");
  if (
    sourceHashes.pbpSha256 !== sha(raw) ||
    sourceHashes.htmlSha256 !== createHash("sha256").update(html).digest("hex")
  )
    throw Error("Classification effective PBP/HTML hash differs");
  const date = new Date(game.gameDate + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== game.gameDate
  )
    throw Error("Invalid classification date");
  const page = load(html),
    cells = page("td")
      .toArray()
      .map((td) => page(td).text().replace(/\s+/g, " ").trim());
  const expectedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  if (
    !/Play By Play/i.test(page("title").text()) ||
    !cells.includes(expectedDate) ||
    !cells.some(
      (c) =>
        /^(?:Match\/)?Game\s+\d+$/.test(c) &&
        Number(c.match(/\d+/)![0]) === game.id % 10000,
    ) ||
    box.id !== game.id ||
    box.gameDate !== game.gameDate ||
    box.homeTeam.id !== game.homeTeam.id ||
    box.awayTeam.id !== game.awayTeam.id ||
    box.homeTeam.score !== game.homeTeam.score ||
    box.awayTeam.score !== game.awayTeam.score
  )
    throw Error("Wrong classification primary report/box identity");
  const roster = new Map(game.rosterSpots.map((p) => [p.playerId, p]));
  if (
    roster.size !== game.rosterSpots.length ||
    new Set(game.plays.map((p) => p.eventId)).size !== game.plays.length
  )
    throw Error("Duplicate classification native identity");
  const role = (id: number): "F" | "D" | "G" => {
    const r = roster.get(id);
    if (!r || !["C", "L", "R", "D", "G"].includes(r.positionCode))
      throw Error("Unknown classification roster role");
    return r.positionCode === "G" ? "G" : r.positionCode === "D" ? "D" : "F";
  };
  const official = new Map<number, OnGoalOfficialGameRow>();
  for (const row of officialRows) {
    if (
      row.gameId !== game.id ||
      row.date !== game.gameDate ||
      row.gamesPlayed !== 1 ||
      !["F", "D", "G"].includes(row.position) ||
      !count(row.playerId) ||
      row.playerId === 0 ||
      official.has(row.playerId) ||
      row.teamId !== roster.get(row.playerId)?.teamId ||
      (row.position === "G") !== (role(row.playerId) === "G") ||
      !count(row.onGoal) ||
      !count(row.goals)
    )
      throw Error(
        `Invalid classification official game row ${JSON.stringify(row)}`,
      );
    official.set(row.playerId, row);
  }
  const unplayedFreshBoxGoalies: NonNullable<
    OfficialOnGoalClassificationProof["unplayedFreshBoxGoalies"]
  > = [];
  for (const [side, groups] of Object.entries(box.playerByGameStats))
    for (const [group, players] of Object.entries(groups))
      for (const p of players) {
        const id = Number(p.playerId),
          r = official.get(id),
          goalie = group === "goalies",
          onGoal = goalie ? p.shotsAgainst : p.sog,
          goals = goalie ? p.goalsAgainst : p.goals;
        if (
          !r &&
          goalie &&
          Math.floor(game.id / 1e6) === 2008 &&
          p.starter === false &&
          roster.get(id)?.positionCode === "G" &&
          roster.get(id)?.teamId ===
            (side === "homeTeam" ? game.homeTeam.id : game.awayTeam.id) &&
          ["shotsAgainst", "goalsAgainst", "saves", "savePctg"].every(
            (k) => p[k] === undefined || p[k] === null,
          ) &&
          (p.toi === undefined || p.toi === null || p.toi === "00:00") &&
          !game.plays.some(
            (e) =>
              e.periodDescriptor.periodType !== "SO" &&
              kind(e.typeDescKey) &&
              [
                e.details?.shootingPlayerId,
                e.details?.scoringPlayerId,
                e.details?.goalieInNetId,
              ].includes(id),
          )
        ) {
          unplayedFreshBoxGoalies.push({
            teamId: roster.get(id)!.teamId,
            playerId: id,
            originalRecord: structuredClone(p),
            interpretation:
              "Fresh box explicitly marks nonstarter, official positive-GP summary has no appearance, no played statistics or native physical witness. Missing values remain unknown; no zero counts or exposure inferred.",
          });
          continue;
        }
        if (!count(onGoal) || !count(goals))
          throw Error("Unknown classification fresh box counts");
        if (!r) {
          if (
            onGoal !== 0 ||
            goals !== 0 ||
            typeof p.toi !== "string" ||
            seconds(p.toi) !== 0
          )
            throw Error("Missing played classification official row");
          continue;
        }
        if (
          (r.position === "G") !== goalie ||
          r.onGoal !== onGoal ||
          r.goals !== goals ||
          r.teamId !==
            (side === "homeTeam" ? game.homeTeam.id : game.awayTeam.id)
        )
          throw Error("Official classification box/summary/role differs");
      }
  const boxIds = new Set(
    Object.values(box.playerByGameStats)
      .flatMap((groups) => Object.values(groups).flat())
      .map((p) => Number(p.playerId)),
  );
  if ([...official.keys()].some((id) => !boxIds.has(id)))
    throw Error("Missing classification fresh box actor");
  const so = new Set(
    game.plays
      .filter((p) => p.periodDescriptor.periodType === "SO")
      .map((p) => p.periodDescriptor.number),
  );
  const unrelatedContextDiscrepancies: OfficialOnGoalClassificationProof["unrelatedContextDiscrepancies"] =
    [];
  const reports: Array<{
    ordinal: number;
    period: number;
    second: number;
    kind: OnGoalClassificationEvent["kind"];
    shooter: number;
    goalie: number;
    situation: string;
    shotType: string;
    primaryRow: string[];
  }> = [];
  for (const tr of page("tr").toArray()) {
    const v = page(tr)
      .children("td")
      .toArray()
      .map((td) => page(td).text().replace(/\s+/g, " ").trim());
    if (
      v.length !== 8 ||
      !/^\d+$/.test(v[0]!) ||
      !/^\d+$/.test(v[1]!) ||
      so.has(Number(v[1])) ||
      Number(v[1]) > 4 ||
      !["SHOT", "MISS", "GOAL"].includes(v[4]!)
    )
      continue;
    const m = v[5]!.match(/^([A-Z.]+)(?: ONGOAL -)?\s+#(\d+)\s+([^,(;]+)/);
    if (!m) throw Error("Malformed classification primary actor");
    const team =
      teamCode(m[1]!) === teamCode(game.homeTeam.abbrev)
        ? game.homeTeam.id
        : teamCode(m[1]!) === teamCode(game.awayTeam.abbrev)
          ? game.awayTeam.id
          : 0;
    const actors = game.rosterSpots.filter(
      (r) =>
        r.teamId === team &&
        r.sweaterNumber === Number(m[2]) &&
        (norm(r.lastName.default) === norm(m[3]!) ||
          (r.playerId === 8471269 &&
            norm(r.firstName?.default ?? "") === "NICKLAS" &&
            norm(r.lastName.default) === "GROSSMANN" &&
            norm(m[3]!) === "GROSSMAN")),
    );
    if (actors.length !== 1 || !official.has(actors[0]!.playerId))
      throw Error(
        `Unverified classification primary actor/team ${v[0]} ${v[5]}`,
      );
    const unrelated0404 =
      game.id === 2012020404 &&
      Number(v[0]) === 156 &&
      Number(v[1]) === 2 &&
      seconds(v[3]!) === 1176 &&
      actors[0]!.playerId === 8467423 &&
      v[6] === "24 C 51 C 22 R 40 L 2 D 27 D 35 G" &&
      v[7] === "10 C 13 R 83 R 94 L 6 D 19 D 40 G" &&
      !playerIds.includes(8467423) &&
      !playerIds.includes(8470657);
    const lineups: number[][] = [];
    for (const [index, teamId] of [
      [6, game.awayTeam.id],
      [7, game.homeTeam.id],
    ]) {
      const tokens = [...v[index]!.matchAll(/(\d+)\s+([CLRDG])(?:\s|$)/g)],
        ids = tokens.map((token) => {
          const found = game.rosterSpots.filter(
            (r) =>
              r.teamId === teamId &&
              r.sweaterNumber === Number(token[1]) &&
              (r.positionCode === token[2] ||
                (Math.floor(game.id / 1e6) === 2008 &&
                  ["C", "L", "R"].includes(r.positionCode) &&
                  ["C", "L", "R"].includes(token[2]!))),
          );
          if (found.length !== 1)
            throw Error(
              `Unknown classification report lineup ordinal ${v[0]} team ${teamId} jersey ${token[1]} role ${token[2]} native ${game.rosterSpots
                .filter(
                  (r) =>
                    r.teamId === teamId && r.sweaterNumber === Number(token[1]),
                )
                .map((r) => `${r.playerId}:${r.positionCode}`)
                .join(",")}`,
            );
          return found[0]!.playerId;
        });
      if (
        !ids.length ||
        (ids.length > 6 && !(unrelated0404 && ids.length === 7)) ||
        new Set(ids).size !== ids.length ||
        tokens
          .map((t) => t[0])
          .join("")
          .replace(/\s/g, "") !== v[index]!.replace(/\s/g, "")
      )
        throw Error(
          `Malformed classification report lineup ${v[0]} ${index} ${v[index]}`,
        );
      lineups.push(ids);
    }
    const defending = lineups[team === game.homeTeam.id ? 0 : 1]!,
      goalies = defending.filter((id) => role(id) === "G");
    if (goalies.length > 1)
      throw Error("Ambiguous classification report goalie");
    const awayG = lineups[0]!.filter((id) => role(id) === "G").length,
      homeG = lineups[1]!.filter((id) => role(id) === "G").length;
    if (unrelated0404)
      unrelatedContextDiscrepancies.push({
        ordinal: 156,
        period: 2,
        second: 1176,
        shooter: 8467423,
        rawAwayLineup: v[6]!,
        rawHomeLineup: v[7]!,
        reason:
          "Unrelated primary row prints seven players per side while native is 1551; no lineup repair or selected-group authority.",
      });
    reports.push({
      ordinal: Number(v[0]),
      period: Number(v[1]),
      second: seconds(v[3]!),
      kind: v[4] as OnGoalClassificationEvent["kind"],
      shooter: actors[0]!.playerId,
      goalie: goalies[0] ?? 0,
      shotType: norm(v[5]!.split(",")[1] ?? ""),
      primaryRow: [...v],
      situation: `${awayG}${lineups[0]!.length - awayG}${lineups[1]!.length - homeG}${homeG}`,
    });
  }
  if (new Set(reports.map((r) => r.ordinal)).size !== reports.length)
    throw Error("Duplicate classification report ordinal");
  const native = game.plays
    .filter(
      (p) => p.periodDescriptor.periodType !== "SO" && kind(p.typeDescKey),
    )
    .map((p) => {
      const d = p.details ?? {},
        shooter = Number(d.shootingPlayerId ?? d.scoringPlayerId),
        goalieRaw = Number(d.goalieInNetId ?? 0),
        r = roster.get(shooter);
      const primary = reports.filter(
        (e) =>
          e.period === p.periodDescriptor.number &&
          e.second === seconds(p.timeInPeriod) &&
          e.kind === kind(p.typeDescKey) &&
          e.shooter === shooter,
      );
      const defendingIndex = r?.teamId === game.homeTeam.id ? 0 : 3;
      const goalie =
        d.goalieInNetId === undefined &&
        p.situationCode?.[defendingIndex] === "1" &&
        primary.length === 1
          ? primary[0]!.goalie
          : goalieRaw;
      if (
        !count(p.eventId) ||
        !count(p.sortOrder) ||
        !r ||
        !official.has(shooter) ||
        d.eventOwnerTeamId !== r.teamId ||
        (goalie &&
          (!official.has(goalie) ||
            role(goalie) !== "G" ||
            roster.get(goalie)!.teamId === r.teamId))
      )
        throw Error("Invalid classification native actor");
      const nativeGeometry: OnGoalClassificationEvent["nativeGeometry"] = {};
      for (const k of ["xCoord", "yCoord"] as const)
        if (d[k] !== undefined) {
          if (typeof d[k] !== "number" || !Number.isFinite(d[k]))
            throw Error("Invalid classification native geometry");
          nativeGeometry[k] = d[k];
        }
      for (const k of ["shotType", "zoneCode"] as const)
        if (d[k] !== undefined) {
          if (typeof d[k] !== "string")
            throw Error("Invalid classification native geometry label");
          nativeGeometry[k] = d[k];
        }
      if (p.situationCode !== undefined)
        nativeGeometry.situationCode = p.situationCode;
      return {
        eventId: p.eventId,
        period: p.periodDescriptor.number,
        second: seconds(p.timeInPeriod),
        kind: kind(p.typeDescKey)!,
        shooter,
        goalie,
        nativeGoalieInNetId: d.goalieInNetId === undefined ? null : goalieRaw,
        resolvedPrimaryGoalie:
          d.goalieInNetId === undefined && goalie !== 0 ? goalie : null,
        nativeGeometry,
      };
    });
  const homePrimaryGoals = reports.filter(
    (r) =>
      r.kind === "GOAL" && roster.get(r.shooter)!.teamId === game.homeTeam.id,
  ).length;
  const awayPrimaryGoals = reports.filter(
    (r) =>
      r.kind === "GOAL" && roster.get(r.shooter)!.teamId === game.awayTeam.id,
  ).length;
  const shootoutHomePoint =
    so.size > 0 && game.homeTeam.score > game.awayTeam.score ? 1 : 0;
  const shootoutAwayPoint =
    so.size > 0 && game.awayTeam.score > game.homeTeam.score ? 1 : 0;
  if (
    homePrimaryGoals !== game.homeTeam.score - shootoutHomePoint ||
    awayPrimaryGoals !== game.awayTeam.score - shootoutAwayPoint
  )
    throw Error(
      "Classification primary GOAL population differs from final official score",
    );
  const owns = (
    e: Pick<OnGoalClassificationEvent, "shooter" | "goalie">,
    id: number,
  ) => (role(id) === "G" ? e.goalie === id : e.shooter === id);
  const unrelatedMissingExposure: OfficialOnGoalClassificationProof["unrelatedMissingExposure"] =
    [];
  const selected = new Set(playerIds),
    conflicts: number[] = [];
  for (const row of official.values()) {
    const n = native.filter((e) => owns(e, row.playerId)),
      r = reports.filter((e) => owns(e, row.playerId));
    if (selected.has(row.playerId) && n.length !== r.length)
      throw Error(
        `Classification full physical group differs ${row.playerId} native=${n.length} primary=${r.length}`,
      );
    const nativeGoals = n.filter((e) => e.kind === "GOAL").length,
      primaryGoals = r.filter((e) => e.kind === "GOAL").length;
    if (
      primaryGoals !== row.goals ||
      nativeGoals > primaryGoals ||
      (selected.has(row.playerId) && nativeGoals !== primaryGoals)
    )
      throw Error(
        `Classification GOAL/GA facts do not conserve ${row.playerId}`,
      );
    const ng = n.filter((e) => e.kind !== "MISS").length,
      pg = r.filter((e) => e.kind !== "MISS").length;
    if (ng > pg || (selected.has(row.playerId) && ng !== pg))
      throw Error(
        `Native/primary classification SOG membership differs ${row.playerId} native=${ng} primary=${pg}`,
      );
    if (n.length > r.length)
      throw Error("Native physical population exceeds primary report");
    if (
      !selected.has(row.playerId) &&
      (ng < pg || nativeGoals < primaryGoals || n.length < r.length)
    )
      unrelatedMissingExposure.push({
        playerId: row.playerId,
        position: row.position,
        missingGoals: primaryGoals - nativeGoals,
        missingPrimaryOnGoalAttempts: pg - ng,
        missingPhysicalAttempts: r.length - n.length,
      });
    if (pg !== row.onGoal) {
      if (pg < row.onGoal)
        throw Error("Classification cannot hide missing physical SOG");
      conflicts.push(row.playerId);
    }
  }
  if (
    conflicts.length !== selected.size ||
    conflicts.some((id) => !selected.has(id))
  )
    throw Error(
      `Classification selection must include exact complete conflict population selected=${[...selected]} conflicts=${conflicts}`,
    );
  const unorderedPrimaryIdentityGroups: OfficialOnGoalClassificationProof["unorderedPrimaryIdentityGroups"] =
    [];
  const ambiguousPair =
    game.id === 2011021166
      ? native.filter((e) => [14, 15].includes(e.eventId))
      : [];
  const pairReports =
    game.id === 2011021166
      ? reports.filter((r) => [14, 15].includes(r.ordinal))
      : [];
  const pairCommon = (e: {
    period: number;
    second: number;
    kind: string;
    shooter: number;
    goalie: number;
  }) =>
    e.period === 1 &&
    e.second === 126 &&
    e.kind === "SHOT" &&
    e.shooter === 8473526 &&
    e.goalie === 8462147;
  const unorderedPairValid =
    ambiguousPair.length === 2 &&
    pairReports.length === 2 &&
    ambiguousPair.every(
      (e) =>
        pairCommon(e) &&
        e.nativeGeometry.situationCode === "1551" &&
        e.nativeGeometry.shotType === "backhand",
    ) &&
    pairReports.every(
      (r) =>
        pairCommon(r) && r.situation === "1551" && r.shotType === "BACKHAND",
    ) &&
    native.filter(pairCommon).length === 2 &&
    reports.filter(pairCommon).length === 2;
  if (unorderedPairValid)
    unorderedPrimaryIdentityGroups.push({
      nativeEventIds: [14, 15],
      primaryOrdinals: [14, 15],
      commonKey: {
        period: 1,
        second: 126,
        kind: "SHOT",
        shooter: 8473526,
        goalie: 8462147,
        situation: "1551",
      },
      primaryRows: pairReports.map((r) => r.primaryRow),
      interpretation:
        "Unordered primary identity pair only: no native-ID to report-ordinal mapping is asserted. Native geometry/order/IDs stay unchanged; differing report distance and skater lineups are audit-only and never enrich native events.",
    });
  const consumed = new Set<number>();
  for (const event of native.filter(
    (e) => e.kind === "GOAL" || playerIds.some((id) => owns(e, id)),
  )) {
    if (unorderedPairValid && [14, 15].includes(event.eventId)) {
      consumed.add(14);
      consumed.add(15);
      continue;
    }
    let matches = reports.filter(
      (r) =>
        r.period === event.period &&
        r.second === event.second &&
        r.kind === event.kind &&
        r.shooter === event.shooter &&
        r.goalie === event.goalie,
    );
    if (matches.length > 1 && event.nativeGeometry.shotType)
      matches = matches.filter(
        (r) => r.shotType === norm(event.nativeGeometry.shotType!),
      );
    if (matches.length !== 1 || consumed.has(matches[0]!.ordinal))
      throw Error(
        `Classification physical attempt lacks unique primary identity event=${event.eventId} kind=${event.kind} actor=${event.shooter} goalie=${event.goalie} matches=${matches.length}`,
      );
    if (
      playerIds.some((id) => owns(event, id)) &&
      event.nativeGeometry.situationCode !== matches[0]!.situation
    )
      throw Error(
        `Classification native/report manpower differs event=${event.eventId} native=${event.nativeGeometry.situationCode} report=${matches[0]!.situation}`,
      );
    consumed.add(matches[0]!.ordinal);
  }
  const groups = playerIds.map((id) => {
    const row = official.get(id)!;
    return {
      playerId: id,
      position: row.position,
      officialOnGoalAttempts: row.onGoal,
      primaryLabeledOnGoalAttempts: reports.filter(
        (e) => owns(e, id) && e.kind !== "MISS",
      ).length,
      officialGoals: row.goals,
      events: native.filter((e) => owns(e, id)),
    };
  });
  return {
    version: "nhl-official-on-goal-classification-conflict-v1",
    gameId: game.id,
    date: game.gameDate,
    sourceHashes: { ...sourceHashes },
    groups,
    unrelatedMissingExposure,
    ...(unplayedFreshBoxGoalies.length ? { unplayedFreshBoxGoalies } : {}),
    unrelatedContextDiscrepancies,
    unorderedPrimaryIdentityGroups,
    interpretation:
      Math.floor(game.id / 1e6) === 2008
        ? "Entire selected player-game native and primary physical groups and GOAL/GA facts agree; completed official SOG/SA accounting differs. GOAL labels remain immutable, including a verified GOAL with official SOG zero. This accounting disagreement is not evidence that a GOAL was a MISS. No particular event is assigned a different SOG label, relabeled, removed or assigned a new value. Unrelated deficits remain missing exposure and are not forgiven."
        : "Entire selected player-game native and primary physical groups and GOAL facts agree; official pergame SOG/SA totals disagree. Unrelated native deficits remain recorded as missing exposure and are not repaired or forgiven. Which attempt has a different official SOG classification is unknown. No event is relabeled, removed or assigned a new value.",
  };
}
export function reviewedOnGoalClassificationGroups(
  proof: OfficialOnGoalClassificationProof,
): ReviewedOnGoalClassificationGroup[] {
  if (
    proof.version !== "nhl-official-on-goal-classification-conflict-v1" ||
    !allowedGames.has(proof.gameId)
  )
    throw Error("Invalid classification proof");
  return proof.groups.map((group) => {
    const result = {
      ...structuredClone(group),
      gameId: proof.gameId,
      date: proof.date,
      sourceHashes: { ...proof.sourceHashes },
      proofSha256: sha(proof),
    };
    return { ...result, groupSha256: sha(result) };
  });
}
export function validateReviewedOnGoalClassificationGroup(
  group: ReviewedOnGoalClassificationGroup,
) {
  const { groupSha256, ...body } = group;
  const date = new Date(group.date + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== group.date ||
    group.playerId === 0 ||
    !Array.isArray(group.events) ||
    group.events.some(
      (e) =>
        !count(e.eventId) ||
        !count(e.period) ||
        e.period < 1 ||
        e.period > 4 ||
        !count(e.second) ||
        e.second > 1200 ||
        !count(e.shooter) ||
        e.shooter === 0 ||
        !count(e.goalie) ||
        (e.nativeGoalieInNetId !== null &&
          (!count(e.nativeGoalieInNetId) ||
            e.nativeGoalieInNetId !== e.goalie)) ||
        (e.resolvedPrimaryGoalie !== null &&
          (!count(e.resolvedPrimaryGoalie) ||
            e.resolvedPrimaryGoalie !== e.goalie ||
            e.nativeGoalieInNetId !== null ||
            e.goalie === 0)) ||
        (e.nativeGoalieInNetId === null &&
          e.resolvedPrimaryGoalie === null &&
          e.goalie !== 0) ||
        !["SHOT", "MISS", "GOAL"].includes(e.kind) ||
        (group.position === "G"
          ? e.goalie !== group.playerId
          : e.shooter !== group.playerId) ||
        !e.nativeGeometry ||
        Object.entries(e.nativeGeometry).some(
          ([k, v]) =>
            ![
              "xCoord",
              "yCoord",
              "shotType",
              "zoneCode",
              "situationCode",
            ].includes(k) ||
            (["xCoord", "yCoord"].includes(k)
              ? typeof v !== "number" || !Number.isFinite(v)
              : typeof v !== "string"),
        ),
    )
  )
    throw Error("Invalid reviewed classification event/date/owner");
  if (
    !REVIEWED_ON_GOAL_CLASSIFICATION_GAMES.some(
      (s) =>
        s.gameId === group.gameId &&
        (s.playerIds as readonly number[]).includes(group.playerId),
    ) ||
    !isHash(groupSha256) ||
    sha(body) !== groupSha256 ||
    !isHash(group.proofSha256) ||
    Object.keys(group.sourceHashes).length !== 4 ||
    !Object.values(group.sourceHashes).every(isHash) ||
    !count(group.playerId) ||
    !["F", "D", "G"].includes(group.position) ||
    !count(group.officialOnGoalAttempts) ||
    !count(group.primaryLabeledOnGoalAttempts) ||
    group.primaryLabeledOnGoalAttempts <= group.officialOnGoalAttempts ||
    !count(group.officialGoals) ||
    !group.events.length ||
    new Set(group.events.map((e) => e.eventId)).size !== group.events.length ||
    group.events.filter((e) => e.kind !== "MISS").length !==
      group.primaryLabeledOnGoalAttempts ||
    group.events.filter((e) => e.kind === "GOAL").length !== group.officialGoals
  )
    throw Error("Invalid reviewed classification group binding");
}

import { load } from "cheerio";
import { clockSeconds } from "./game-value-input";
import {
  parseMissingNativePenaltyShot,
  applyMissingNativePenaltyShot,
} from "./official-missing-penalty-shot";
import {
  parseOfficialPenaltyShots,
  penaltyShotGameMatches,
  type PenaltyShotGameTotal,
} from "./official-penalty-shot-report";
type Play = {
  eventId: number;
  sortOrder: number;
  periodDescriptor: { number: number; periodType: string };
  timeInPeriod: string;
  typeDescKey: string;
  situationCode?: string;
  details?: Record<string, unknown>;
};
type Game = {
  id: number;
  plays: Play[];
  homeTeam: { id: number };
  awayTeam: { id: number };
  rosterSpots: Array<{
    playerId: number;
    teamId: number;
    sweaterNumber: number;
    positionCode: string;
    lastName: { default: string };
  }>;
};
export type OfficialPenaltyShotContextProof = {
  version:
    | "nhl-official-unclassified-penalty-shot-context-v1"
    | "nhl-official-unclassified-penalty-shot-context-v2"
    | "nhl-official-verified-nonscoring-penalty-shot-context-v3"
    | "nhl-official-missing-native-saved-penalty-shot-v4";
  /** Present only for the separately verified nonisolated-offense report class. */
  contextProofClass?:
    | "full-offense-versus-goalie-only"
    | "normal-play-then-isolated-nonscoring-ps"
    | "missing-native-terminal-saved-ps";
  gameId: number;
  penaltyShotEventIds: number[];
  unclassifiedEventIds: number[];
  ordinaryEventIds?: number[];
  shooter: number;
  goalie: number;
  period: number;
  second: number;
  reportOrdinals: {
    unclassified?: number;
    ordinary?: number;
    penaltyShot: number;
    award?: number;
    followingFaceoff?: number;
  };
  missingNative?: {
    eventId: number;
    sortOrder: number;
    awardEventId: number;
    followingFaceoffEventId: number;
    ownerTeamId: number;
    shotType: "snap";
  };
  officialShooterShots: number;
  officialGoalieShots: number;
  hashes: {
    pbpSha256: string;
    htmlSha256: string;
    boxSha256: string;
    scopedPenaltyLedgerSha256: string;
  };
  interpretation: string;
};
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
export function applyOfficialPenaltyShotContext<T>(
  raw: T,
  proof: OfficialPenaltyShotContextProof,
  pbpSha256: string,
): T {
  if (proof.version === "nhl-official-missing-native-saved-penalty-shot-v4")
    return applyMissingNativePenaltyShot(raw, proof, pbpSha256);
  const game = raw as Game;
  if (
    !(
      (proof.version === "nhl-official-unclassified-penalty-shot-context-v1" &&
        proof.contextProofClass === undefined) ||
      (proof.version === "nhl-official-unclassified-penalty-shot-context-v2" &&
        proof.contextProofClass === "full-offense-versus-goalie-only") ||
      (proof.version ===
        "nhl-official-verified-nonscoring-penalty-shot-context-v3" &&
        proof.contextProofClass === "normal-play-then-isolated-nonscoring-ps" &&
        proof.ordinaryEventIds?.length === 1)
    ) ||
    game.id !== proof.gameId ||
    proof.hashes.pbpSha256 !== pbpSha256 ||
    proof.penaltyShotEventIds.length !== 1 ||
    proof.unclassifiedEventIds.length !==
      (proof.version ===
      "nhl-official-verified-nonscoring-penalty-shot-context-v3"
        ? 0
        : 1) ||
    proof.penaltyShotEventIds[0] === proof.unclassifiedEventIds[0] ||
    proof.penaltyShotEventIds[0] === proof.ordinaryEventIds?.[0] ||
    [
      ...proof.penaltyShotEventIds,
      ...proof.unclassifiedEventIds,
      ...(proof.ordinaryEventIds ?? []),
    ].some((id) => game.plays.filter((p) => p.eventId === id).length !== 1)
  )
    throw Error("Invalid official penalty-shot context proof identity");
  return {
    ...game,
    plays: game.plays.map((p) =>
      proof.penaltyShotEventIds.includes(p.eventId)
        ? { ...p, details: { ...p.details, nhlReportPenaltyShot: true } }
        : proof.unclassifiedEventIds.includes(p.eventId)
          ? {
              ...p,
              details: {
                ...p.details,
                nhlReportUnclassifiedPenaltyShotContext: true,
              },
            }
          : p,
    ),
  } as T;
}

/** No claim about the disputed SHOT's physical nature is made. It stays an
 * official SOG/SA observation, with unavailable model value, never invented0xG.
 * The terminal explicitly labeled goal is the single official PS attempt. */
export function parseOfficialPenaltyShotContext(
  html: string,
  raw: unknown,
  rawBox: unknown,
  totals: PenaltyShotGameTotal[],
  hashes: OfficialPenaltyShotContextProof["hashes"],
): OfficialPenaltyShotContextProof {
  if ((raw as { id?: number })?.id === 2009020519)
    return parseMissingNativePenaltyShot(html, raw, rawBox, totals, hashes);
  if (
    totals.length === 1 &&
    totals[0]!.penaltyShotAttempts === 1 &&
    totals[0]!.penaltyShotsGoals === 0
  )
    return parseVerifiedNonscoringPenaltyShotContext(
      html,
      raw,
      rawBox,
      totals,
      hashes,
    );
  const game = raw as Game,
    box = rawBox as {
      id: number;
      playerByGameStats: Record<
        string,
        Record<string, Array<Record<string, unknown>>>
      >;
    };
  if (
    !Object.values(hashes).every((h) => /^[a-f0-9]{64}$/.test(h)) ||
    box.id !== game.id ||
    totals.length !== 1 ||
    totals[0]!.gameId !== game.id ||
    totals[0]!.penaltyShotAttempts !== 1 ||
    totals[0]!.penaltyShotsGoals !== 1
  )
    throw Error("Unsupported official penalty-shot context source scope");
  const shooter = totals[0]!.playerId,
    roster = game.rosterSpots.filter((r) => r.playerId === shooter);
  if (roster.length !== 1)
    throw Error("Unknown official penalty-shot context shooter");
  const page = load(html),
    records: Array<{
      ordinal: number;
      period: number;
      second: number;
      kind: string;
      description: string;
      away: string;
      home: string;
    }> = [];
  page("tr").each((_, tr) => {
    const cs = page(tr).children("td");
    if (cs.length !== 8) return;
    const v = cs
        .toArray()
        .map((c) => page(c).text().replace(/\s+/g, " ").trim()),
      clock = v[3]!.match(/^(\d+:\d{2})/);
    if (
      !clock ||
      !Number.isInteger(Number(v[0])) ||
      !Number.isInteger(Number(v[1]))
    )
      return;
    records.push({
      ordinal: Number(v[0]),
      period: Number(v[1]),
      second: clockSeconds(clock[1]),
      kind: v[4]!,
      description: v[5]!,
      away: v[6]!,
      home: v[7]!,
    });
  });
  const identifies = (s: string) => {
    const m = s.match(/#(\d+)\s+([^,]+)/);
    return (
      m &&
      Number(m[1]) === roster[0]!.sweaterNumber &&
      norm(m[2]!.replace(/\([^)]*\)/g, "")) ===
        norm(roster[0]!.lastName.default)
    );
  };
  const labels = records.filter(
    (r) =>
      r.kind === "GOAL" &&
      /Penalty Shot/i.test(r.description) &&
      identifies(r.description),
  );
  if (labels.length !== 1)
    throw Error("Ambiguous official penalty-shot terminal goal");
  const goalReport = labels[0]!,
    goals = game.plays.filter(
      (p) =>
        p.typeDescKey === "goal" &&
        p.periodDescriptor.periodType !== "SO" &&
        p.periodDescriptor.number === goalReport.period &&
        clockSeconds(p.timeInPeriod) === goalReport.second &&
        Number(p.details?.scoringPlayerId) === shooter &&
        Number(p.details?.eventOwnerTeamId) === roster[0]!.teamId,
    );
  if (goals.length !== 1)
    throw Error("Official penalty-shot goal identity mismatch");
  const goal = goals[0]!,
    goalie = Number(goal.details?.goalieInNetId),
    home = roster[0]!.teamId === game.homeTeam.id;
  const goalieRoster = game.rosterSpots.filter(
    (r) =>
      r.playerId === goalie &&
      r.positionCode === "G" &&
      r.teamId === (home ? game.awayTeam.id : game.homeTeam.id),
  );
  if (goalieRoster.length !== 1)
    throw Error("Unknown official penalty-shot context goalie");
  const isolated = (r: typeof goalReport) => {
    const offense = home ? r.home : r.away,
      defense = home ? r.away : r.home;
    return (
      new RegExp(`^${roster[0]!.sweaterNumber} [CDLRW]{1,2}$`).test(offense) &&
      defense === `${goalieRoster[0]!.sweaterNumber} G`
    );
  };
  const awards = game.plays.filter(
    (p) =>
      p.typeDescKey === "penalty" &&
      p.details?.typeCode === "PS" &&
      p.periodDescriptor.number === goalReport.period &&
      clockSeconds(p.timeInPeriod) === goalReport.second &&
      p.sortOrder < goal.sortOrder &&
      Number(p.details?.drawnByPlayerId) === shooter &&
      Number(p.details?.eventOwnerTeamId) === goalieRoster[0]!.teamId,
  );
  if (awards.length !== 1 || !isolated(goalReport))
    throw Error("Unverified isolated official penalty-shot goal/award");
  const contextual = game.plays.filter(
    (p) =>
      p.typeDescKey === "shot-on-goal" &&
      p.periodDescriptor.periodType !== "SO" &&
      p.periodDescriptor.number === goalReport.period &&
      clockSeconds(p.timeInPeriod) === goalReport.second &&
      p.sortOrder > awards[0]!.sortOrder &&
      p.sortOrder < goal.sortOrder &&
      Number(p.details?.shootingPlayerId) === shooter &&
      Number(p.details?.eventOwnerTeamId) === roster[0]!.teamId &&
      Number(p.details?.goalieInNetId) === goalie,
  );
  if (
    contextual.length !== 1 ||
    game.plays.some(
      (p) =>
        p.typeDescKey === "faceoff" &&
        p.sortOrder > awards[0]!.sortOrder &&
        p.sortOrder < goal.sortOrder,
    )
  )
    throw Error("Ambiguous official penalty-shot context sequence");
  const shotReport = records.filter(
    (r) =>
      r.kind === "SHOT" &&
      r.period === goalReport.period &&
      r.second === goalReport.second &&
      r.ordinal < goalReport.ordinal &&
      identifies(r.description),
  );
  if (shotReport.length !== 1)
    throw Error("Official context shot identity/isolated lineup not verified");
  const isolatedContext =
    contextual[0]!.situationCode === goal.situationCode &&
    isolated(shotReport[0]!);
  // A second, intentionally narrow source class. The disputed record is not
  // declared ordinary play: its defender list contains only the verified goalie,
  // while the offense lists five rostered skaters plus its goalie. Retain its
  // official SOG/SA with unavailable classification/value rather than guessing.
  const fullOffenseVersusGoalieOnly = () => {
    const report = shotReport[0]!,
      offense = home ? report.home : report.away,
      defense = home ? report.away : report.home;
    if (
      contextual[0]!.situationCode !== "1551" ||
      defense !== `${goalieRoster[0]!.sweaterNumber} G`
    )
      return false;
    const entries = [...offense.matchAll(/(\d+)\s+(G|[CDLRW]{1,2})(?=\s|$)/g)];
    if (
      entries.length !== 6 ||
      entries.map((m) => `${m[1]} ${m[2]}`).join(" ") !== offense
    )
      return false;
    const players = entries.map((m) => {
      const candidates = game.rosterSpots.filter(
        (r) =>
          r.teamId === roster[0]!.teamId &&
          r.sweaterNumber === Number(m[1]) &&
          (r.positionCode === "G") === (m[2] === "G"),
      );
      return candidates.length === 1 ? candidates[0] : undefined;
    });
    return (
      players.every((p) => p !== undefined) &&
      new Set(players.map((p) => p!.playerId)).size === 6 &&
      players.some((p) => p!.playerId === shooter) &&
      players.filter((p) => p!.positionCode === "G").length === 1
    );
  };
  const nonisolatedContext = !isolatedContext && fullOffenseVersusGoalieOnly();
  if (!isolatedContext && !nonisolatedContext)
    throw Error("Official context shot identity/isolated lineup not verified");
  const expectedCode = home ? "1010" : "0101";
  if (goal.situationCode !== expectedCode)
    throw Error("Penalty-shot context manpower is not isolated");
  const side = box.playerByGameStats[home ? "homeTeam" : "awayTeam"]!,
    opposite = box.playerByGameStats[home ? "awayTeam" : "homeTeam"]!;
  const shooterBox = [...(side.forwards ?? []), ...(side.defense ?? [])].filter(
      (p) => p.playerId === shooter,
    ),
    goalieBox = (opposite.goalies ?? []).filter((p) => p.playerId === goalie);
  const onGoal = game.plays.filter(
    (p) =>
      p.periodDescriptor.periodType !== "SO" &&
      ["goal", "shot-on-goal"].includes(p.typeDescKey),
  );
  const officialShooterShots = Number(shooterBox[0]?.sog),
    officialGoalieShots = Number(goalieBox[0]?.shotsAgainst);
  if (
    shooterBox.length !== 1 ||
    goalieBox.length !== 1 ||
    !Number.isSafeInteger(officialShooterShots) ||
    !Number.isSafeInteger(officialGoalieShots) ||
    officialShooterShots !==
      onGoal.filter(
        (p) =>
          Number(p.details?.shootingPlayerId ?? p.details?.scoringPlayerId) ===
          shooter,
      ).length ||
    officialGoalieShots !==
      onGoal.filter((p) => Number(p.details?.goalieInNetId) === goalie).length
  )
    throw Error(
      "Official shot-count conservation does not support retaining context shot",
    );
  const proof: OfficialPenaltyShotContextProof = {
    version: nonisolatedContext
      ? "nhl-official-unclassified-penalty-shot-context-v2"
      : "nhl-official-unclassified-penalty-shot-context-v1",
    ...(nonisolatedContext
      ? { contextProofClass: "full-offense-versus-goalie-only" as const }
      : {}),
    gameId: game.id,
    penaltyShotEventIds: [goal.eventId],
    unclassifiedEventIds: [contextual[0]!.eventId],
    shooter,
    goalie,
    period: goalReport.period,
    second: goalReport.second,
    reportOrdinals: {
      unclassified: shotReport[0]!.ordinal,
      penaltyShot: goalReport.ordinal,
    },
    officialShooterShots,
    officialGoalieShots,
    hashes: { ...hashes },
    interpretation: nonisolatedContext
      ? "Official terminal PS goal receives one prior-baseline attempt. Earlier same-clock SHOT lists a full rostered offense against only the verified defending goalie. Its physical classification is unresolved; retain official SOG/SA with unavailable model value, never delete it, assign zero xG or call it ordinary play."
      : "Official terminal PS goal receives one prior-baseline attempt. Earlier same-clock isolated SHOT remains in SOG/SA denominators, with classification and model value unavailable; it is neither deleted, assigned zero xG nor called ordinary play.",
  };
  const corrected = applyOfficialPenaltyShotContext(
    raw,
    proof,
    hashes.pbpSha256,
  );
  const ids = parseOfficialPenaltyShots(html, corrected, totals);
  if (ids.length !== 1 || ids[0] !== goal.eventId)
    throw Error(
      "Official penalty-shot context result did not reconcile ledger",
    );
  return proof;
}

/** The preceding attempt is retained as ordinary ONLY when both reports show
 * complete normal on-ice teams. No absent award record is invented, and no
 * assertion about its whistle/award timing is needed to establish that context.
 * Ambiguous isolated/full-offense-only preceding records fail this proof class. */
function parseVerifiedNonscoringPenaltyShotContext(
  html: string,
  raw: unknown,
  rawBox: unknown,
  totals: PenaltyShotGameTotal[],
  hashes: OfficialPenaltyShotContextProof["hashes"],
): OfficialPenaltyShotContextProof {
  const game = raw as Game & { gameDate: string },
    box = rawBox as {
      id: number;
      homeTeam: { id: number; sog: number };
      awayTeam: { id: number; sog: number };
      playerByGameStats: Record<
        string,
        Record<string, Array<Record<string, unknown>>>
      >;
    },
    page = load(html);
  if (
    !Object.values(hashes).every((h) => /^[a-f0-9]{64}$/.test(h)) ||
    box.id !== game.id ||
    totals[0]!.gameId !== game.id ||
    box.homeTeam.id !== game.homeTeam.id ||
    box.awayTeam.id !== game.awayTeam.id
  )
    throw Error("Invalid nonscoring penalty-shot source scope");
  const cells = page("td")
    .toArray()
    .map((td) => page(td).text().replace(/\s+/g, " ").trim());
  const expectedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(game.gameDate + "T00:00:00Z"));
  if (
    !/Play By Play/i.test(page("title").text()) ||
    !cells.includes(expectedDate) ||
    !cells.some(
      (s) =>
        /^Game\s+\d+$/.test(s) &&
        Number(s.match(/\d+/)![0]) === game.id % 10000,
    )
  )
    throw Error("Wrong nonscoring penalty-shot report identity");
  const shooter = totals[0]!.playerId,
    shooterRoster = game.rosterSpots.filter(
      (r) => r.playerId === shooter && r.positionCode !== "G",
    );
  if (
    shooterRoster.length !== 1 ||
    ![game.homeTeam.id, game.awayTeam.id].includes(shooterRoster[0]!.teamId)
  )
    throw Error("Unknown nonscoring penalty-shot shooter");
  const ownTeam = shooterRoster[0]!.teamId,
    home = ownTeam === game.homeTeam.id,
    otherTeam = home ? game.awayTeam.id : game.homeTeam.id;
  type Report = {
    ordinal: number;
    period: number;
    second: number;
    kind: string;
    description: string;
    away: string;
    home: string;
  };
  const records: Report[] = [];
  page("tr").each((_, tr) => {
    const cs = page(tr).children("td");
    if (cs.length !== 8) return;
    const v = cs
        .toArray()
        .map((c) => page(c).text().replace(/\s+/g, " ").trim()),
      clock = v[3]!.match(/^(\d+:\d{2})/);
    if (clock && /^\d+$/.test(v[0]!) && /^\d+$/.test(v[1]!))
      records.push({
        ordinal: Number(v[0]),
        period: Number(v[1]),
        second: clockSeconds(clock[1]),
        kind: v[4]!,
        description: v[5]!,
        away: v[6]!,
        home: v[7]!,
      });
  });
  if (new Set(records.map((r) => r.ordinal)).size !== records.length)
    throw Error("Duplicate nonscoring report ordinal");
  const identifies = (r: Report) => {
    const m = r.description.match(/#(\d+)\s+([^,]+)/);
    return (
      m &&
      Number(m[1]) === shooterRoster[0]!.sweaterNumber &&
      norm(m[2]!) === norm(shooterRoster[0]!.lastName.default)
    );
  };
  const labels = records.filter(
    (r) =>
      ["SHOT", "MISS"].includes(r.kind) && /Penalty Shot/i.test(r.description),
  );
  if (labels.length !== 1 || !identifies(labels[0]!))
    throw Error("Ambiguous nonscoring explicit PS label");
  const terminalReport = labels[0]!,
    expectedKind =
      terminalReport.kind === "SHOT" ? "shot-on-goal" : "missed-shot";
  const sameClock = (p: Play) =>
    p.periodDescriptor.periodType !== "SO" &&
    p.periodDescriptor.number === terminalReport.period &&
    clockSeconds(p.timeInPeriod) === terminalReport.second;
  const attempts = game.plays
    .filter(
      (p) =>
        sameClock(p) &&
        ["shot-on-goal", "missed-shot", "failed-shot-attempt", "goal"].includes(
          p.typeDescKey,
        ) &&
        Number(p.details?.shootingPlayerId ?? p.details?.scoringPlayerId) ===
          shooter,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (
    attempts.length !== 2 ||
    attempts.some(
      (p) =>
        !Number.isSafeInteger(p.sortOrder) ||
        p.sortOrder < 0 ||
        !Number.isSafeInteger(p.eventId) ||
        p.eventId < 0,
    ) ||
    attempts[0]!.sortOrder >= attempts[1]!.sortOrder ||
    attempts.some(
      (p) =>
        p.typeDescKey !== expectedKind ||
        Number(p.details?.eventOwnerTeamId) !== ownTeam,
    )
  )
    throw Error("Ambiguous nonscoring native attempt pair");
  const ordinary = attempts[0]!,
    terminal = attempts[1]!,
    goalie = Number(terminal.details?.goalieInNetId),
    goalieRoster = game.rosterSpots.filter(
      (r) =>
        r.playerId === goalie &&
        r.positionCode === "G" &&
        r.teamId === otherTeam,
    );
  if (
    goalieRoster.length !== 1 ||
    Number(ordinary.details?.goalieInNetId) !== goalie ||
    terminal.situationCode !== (home ? "1010" : "0101")
  )
    throw Error("Unverified nonscoring isolated goalie/manpower");
  if (
    (home ? terminalReport.home : terminalReport.away) !==
      `${shooterRoster[0]!.sweaterNumber} ${shooterRoster[0]!.positionCode}` ||
    (home ? terminalReport.away : terminalReport.home) !==
      `${goalieRoster[0]!.sweaterNumber} G`
  )
    throw Error("Unverified nonscoring isolated HTML lineup");
  const terminalIndex = records.indexOf(terminalReport),
    ordinaryReport = records[terminalIndex - 1];
  if (
    !ordinaryReport ||
    ordinaryReport.ordinal + 1 !== terminalReport.ordinal ||
    ordinaryReport.period !== terminalReport.period ||
    ordinaryReport.second !== terminalReport.second ||
    ordinaryReport.kind !== terminalReport.kind ||
    !identifies(ordinaryReport) ||
    /Penalty Shot/i.test(ordinaryReport.description)
  )
    throw Error("Unverified preceding ordinary report identity/order");
  const shotTypeMatches = (p: Play, r: Report) =>
    typeof p.details?.shotType === "string" &&
    r.description
      .split(",")
      .slice(1)
      .some((s) => norm(s) === norm(String(p.details!.shotType)));
  if (
    !shotTypeMatches(ordinary, ordinaryReport) ||
    !shotTypeMatches(terminal, terminalReport)
  )
    throw Error("Nonscoring shot types differ between sources");
  const parseLineup = (text: string, team: number) => {
    const tokens = [...text.matchAll(/(\d+)\s+(G|[CDLRW]{1,2})(?=\s|$)/g)];
    if (tokens.map((m) => `${m[1]} ${m[2]}`).join(" ") !== text) return null;
    const players = tokens.map((m) => {
      const matches = game.rosterSpots.filter(
        (r) =>
          r.teamId === team &&
          r.sweaterNumber === Number(m[1]) &&
          (r.positionCode === "G") === (m[2] === "G"),
      );
      return matches.length === 1 ? matches[0] : undefined;
    });
    if (
      players.some((p) => !p) ||
      new Set(players.map((p) => p!.playerId)).size !== players.length
    )
      return null;
    return players as typeof game.rosterSpots;
  };
  const away = parseLineup(ordinaryReport.away, game.awayTeam.id),
    homePlayers = parseLineup(ordinaryReport.home, game.homeTeam.id);
  if (
    !away ||
    !homePlayers ||
    !/^[01][3-5][3-5][01]$/.test(ordinary.situationCode ?? "")
  )
    throw Error("Incomplete preceding ordinary lineups");
  for (const [players, offset, goalieOffset] of [
    [away, 1, 0],
    [homePlayers, 2, 3],
  ] as const) {
    if (
      players.filter((p) => p.positionCode === "G").length !== 1 ||
      Number(ordinary.situationCode![goalieOffset]) !== 1 ||
      players.filter((p) => p.positionCode !== "G").length !==
        Number(ordinary.situationCode![offset])
    )
      throw Error("Ordinary report/native manpower disagree");
  }
  if (
    ![...away, ...homePlayers].some((p) => p.playerId === shooter) ||
    ![...away, ...homePlayers].some((p) => p.playerId === goalie)
  )
    throw Error("Ordinary actors absent from complete report lineups");
  const following = records
    .slice(terminalIndex + 1)
    .find((r) => r.kind !== "STOP");
  if (
    !following ||
    following.kind !== "FAC" ||
    following.period !== terminalReport.period ||
    following.second !== terminalReport.second ||
    game.plays.some(
      (p) =>
        p.sortOrder > ordinary.sortOrder &&
        p.sortOrder < terminal.sortOrder &&
        [
          "faceoff",
          "penalty",
          "goal",
          "shot-on-goal",
          "missed-shot",
          "failed-shot-attempt",
        ].includes(p.typeDescKey),
    ) ||
    !game.plays.some(
      (p) =>
        sameClock(p) &&
        p.typeDescKey === "faceoff" &&
        p.sortOrder > terminal.sortOrder,
    )
  )
    throw Error("Unverified nonscoring resumption/award ordering");
  const onGoal = game.plays.filter(
    (p) =>
      p.periodDescriptor.periodType !== "SO" &&
      ["goal", "shot-on-goal"].includes(p.typeDescKey),
  );
  const side = box.playerByGameStats[home ? "homeTeam" : "awayTeam"]!,
    opposite = box.playerByGameStats[home ? "awayTeam" : "homeTeam"]!;
  const shooterBox = [...(side.forwards ?? []), ...(side.defense ?? [])].filter(
      (p) => p.playerId === shooter,
    ),
    goalieBox = (opposite.goalies ?? []).filter((p) => p.playerId === goalie);
  const officialShooterShots = Number(shooterBox[0]?.sog),
    officialGoalieShots = Number(goalieBox[0]?.shotsAgainst);
  if (
    shooterBox.length !== 1 ||
    goalieBox.length !== 1 ||
    !Number.isSafeInteger(officialShooterShots) ||
    !Number.isSafeInteger(officialGoalieShots) ||
    officialShooterShots !==
      onGoal.filter(
        (p) =>
          Number(p.details?.shootingPlayerId ?? p.details?.scoringPlayerId) ===
          shooter,
      ).length ||
    officialGoalieShots !==
      onGoal.filter((p) => Number(p.details?.goalieInNetId) === goalie).length
  )
    throw Error("Nonscoring official shooter/goalie conservation failed");
  if (
    typeof shooterBox[0]!.sog !== "number" ||
    typeof goalieBox[0]!.shotsAgainst !== "number"
  )
    throw Error("Nonscoring official counts must be observed numeric values");
  for (const [name, team] of [
    ["homeTeam", game.homeTeam.id],
    ["awayTeam", game.awayTeam.id],
  ] as const) {
    const teamBox = box[name],
      stats = box.playerByGameStats[name]!;
    if (
      !Number.isSafeInteger(teamBox.sog) ||
      teamBox.sog !==
        onGoal.filter((p) => Number(p.details?.eventOwnerTeamId) === team)
          .length
    )
      throw Error("Nonscoring official team SOG conservation failed");
    for (const g of stats.goalies ?? []) {
      if (
        !Number.isSafeInteger(g.shotsAgainst) ||
        g.shotsAgainst !==
          onGoal.filter((p) => p.details?.goalieInNetId === g.playerId).length
      )
        throw Error("Nonscoring official all-goalie SA conservation failed");
    }
  }
  const proof: OfficialPenaltyShotContextProof = {
    version: "nhl-official-verified-nonscoring-penalty-shot-context-v3",
    contextProofClass: "normal-play-then-isolated-nonscoring-ps",
    gameId: game.id,
    penaltyShotEventIds: [terminal.eventId],
    unclassifiedEventIds: [],
    ordinaryEventIds: [ordinary.eventId],
    shooter,
    goalie,
    period: terminalReport.period,
    second: terminalReport.second,
    reportOrdinals: {
      ordinary: ordinaryReport.ordinal,
      penaltyShot: terminalReport.ordinal,
    },
    officialShooterShots,
    officialGoalieShots,
    hashes: { ...hashes },
    interpretation:
      "Explicit failed/saved PS is isolated independently in native manpower and official rostered HTML. The preceding separate attempt has complete normal teams in both sources and stays unchanged. No missing award timestamp is inferred; all shooter/team SOG and goalie SA are conserved.",
  };
  const corrected = applyOfficialPenaltyShotContext(
    raw,
    proof,
    hashes.pbpSha256,
  );
  // Only the independently classified normal attempt is omitted from this
  // temporary ambiguity check, never from the returned source or denominators.
  const ids = parseOfficialPenaltyShots(
    html,
    {
      ...game,
      plays: game.plays.filter((p) => p.eventId !== ordinary.eventId),
    },
    totals,
  );
  if (
    ids.length !== 1 ||
    ids[0] !== terminal.eventId ||
    !penaltyShotGameMatches(corrected, totals)
  )
    throw Error("Nonscoring terminal PS ledger failed");
  return proof;
}

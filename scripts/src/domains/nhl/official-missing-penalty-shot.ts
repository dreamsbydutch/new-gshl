import { load } from "cheerio";
import { clockSeconds } from "./game-value-input";
import {
  parseOfficialPenaltyShots,
  penaltyShotGameMatches,
  type PenaltyShotGameTotal,
} from "./official-penalty-shot-report";
import type { OfficialPenaltyShotContextProof } from "./official-penalty-shot-context";

type NativePlay = {
  eventId: number;
  sortOrder: number;
  periodDescriptor: { number: number; periodType: string };
  timeInPeriod: string;
  typeDescKey: string;
  situationCode?: string;
  details?: Record<string, unknown>;
};
type Roster = {
  playerId: number;
  teamId: number;
  sweaterNumber: number;
  positionCode: string;
  lastName: { default: string };
};
type Game = {
  id: number;
  gameType: number;
  gameDate: string;
  gameState: string;
  homeTeam: { id: number; abbrev: string; score: number };
  awayTeam: { id: number; abbrev: string; score: number };
  plays: NativePlay[];
  rosterSpots: Roster[];
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
const V4 = "nhl-official-missing-native-saved-penalty-shot-v4";
type MissingLedger = PenaltyShotGameTotal & {
  gameDate?: string;
  teamAbbrev?: string;
  opponentTeamAbbrev?: string;
  penaltyShotsFailed?: number;
};
const count = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
function deriveEvent(
  game: Game,
  proof: OfficialPenaltyShotContextProof,
): NativePlay {
  const m = proof.missingNative;
  if (
    proof.version !== V4 ||
    proof.contextProofClass !== "missing-native-terminal-saved-ps" ||
    game.id !== 2009020519 ||
    proof.gameId !== game.id ||
    !m ||
    proof.unclassifiedEventIds.length ||
    proof.ordinaryEventIds !== undefined ||
    proof.penaltyShotEventIds.length !== 1 ||
    proof.penaltyShotEventIds[0] !== m.eventId ||
    m.eventId !== 2000000000 + proof.reportOrdinals.penaltyShot ||
    !count(proof.reportOrdinals.penaltyShot) ||
    !Number.isSafeInteger(m.eventId) ||
    !Number.isSafeInteger(m.sortOrder) ||
    m.sortOrder < 0 ||
    m.shotType !== "snap" ||
    proof.period !== 3 ||
    !Number.isInteger(proof.second) ||
    proof.second < 0 ||
    proof.second > 1200
  )
    throw Error("Invalid missing-native PS identity");
  const award = game.plays.filter((p) => p.eventId === m.awardEventId),
    fac = game.plays.filter((p) => p.eventId === m.followingFaceoffEventId);
  const clock = `${String(Math.floor(proof.second / 60)).padStart(2, "0")}:${String(proof.second % 60).padStart(2, "0")}`;
  if (
    award.length !== 1 ||
    fac.length !== 1 ||
    award[0]!.typeDescKey !== "penalty" ||
    award[0]!.details?.typeCode !== "PS" ||
    Number(award[0]!.details?.drawnByPlayerId) !== proof.shooter ||
    fac[0]!.typeDescKey !== "faceoff" ||
    award[0]!.periodDescriptor.number !== proof.period ||
    fac[0]!.periodDescriptor.number !== proof.period ||
    award[0]!.periodDescriptor.periodType !== "REG" ||
    fac[0]!.periodDescriptor.periodType !== "REG" ||
    clockSeconds(award[0]!.timeInPeriod) !== proof.second ||
    clockSeconds(fac[0]!.timeInPeriod) !== proof.second ||
    !Number.isSafeInteger(award[0]!.sortOrder) ||
    !Number.isSafeInteger(fac[0]!.sortOrder) ||
    m.sortOrder !== award[0]!.sortOrder + 1 ||
    m.sortOrder >= fac[0]!.sortOrder ||
    game.plays.some(
      (p) =>
        p.eventId === m.eventId ||
        p.sortOrder === m.sortOrder ||
        (p.sortOrder > award[0]!.sortOrder && p.sortOrder < fac[0]!.sortOrder),
    )
  )
    throw Error("Missing-native PS insertion order/collision changed");
  const own = game.rosterSpots.filter(
      (p) =>
        p.playerId === proof.shooter &&
        p.positionCode !== "G" &&
        p.teamId === m.ownerTeamId,
    ),
    goalie = game.rosterSpots.filter(
      (p) =>
        p.playerId === proof.goalie &&
        p.positionCode === "G" &&
        p.teamId !== m.ownerTeamId,
    );
  if (
    own.length !== 1 ||
    goalie.length !== 1 ||
    ![game.homeTeam.id, game.awayTeam.id].includes(m.ownerTeamId) ||
    goalie[0]!.teamId !==
      (m.ownerTeamId === game.homeTeam.id
        ? game.awayTeam.id
        : game.homeTeam.id) ||
    Number(award[0]!.details?.eventOwnerTeamId) !== goalie[0]!.teamId ||
    game.plays.some(
      (p) =>
        p.periodDescriptor.number === proof.period &&
        p.periodDescriptor.periodType !== "SO" &&
        clockSeconds(p.timeInPeriod) === proof.second &&
        ["goal", "shot-on-goal", "missed-shot", "failed-shot-attempt"].includes(
          p.typeDescKey,
        ),
    )
  )
    throw Error("Missing-native PS actor/context is not uniquely absent");
  return {
    eventId: m.eventId,
    sortOrder: m.sortOrder,
    periodDescriptor: { number: proof.period, periodType: "REG" },
    timeInPeriod: clock,
    typeDescKey: "shot-on-goal",
    situationCode: m.ownerTeamId === game.homeTeam.id ? "1010" : "0101",
    details: {
      shootingPlayerId: proof.shooter,
      goalieInNetId: proof.goalie,
      eventOwnerTeamId: m.ownerTeamId,
      shotType: m.shotType,
      nhlReportPenaltyShot: true,
      nhlOfficialDerivedEvent: "missing-native-saved-penalty-shot-v1",
    },
  };
}
export function applyMissingNativePenaltyShot<T>(
  raw: T,
  proof: OfficialPenaltyShotContextProof,
  pbpSha256: string,
): T {
  if (
    proof.hashes.pbpSha256 !== pbpSha256 ||
    proof.officialShooterShots !== 1 ||
    !count(proof.officialGoalieShots) ||
    proof.officialGoalieShots < 1
  )
    throw Error("Missing-native PS PBP hash/count changed");
  const game = raw as Game,
    event = deriveEvent(game, proof),
    index = game.plays.findIndex(
      (p) => p.eventId === proof.missingNative!.followingFaceoffEventId,
    );
  const plays = [...game.plays];
  plays.splice(index, 0, event);
  return { ...game, plays } as T;
}

/** Exact reviewed missing-terminal class; neither an ordinary event nor geometry is invented. */
export function parseMissingNativePenaltyShot(
  html: string,
  raw: unknown,
  rawBox: unknown,
  totals: MissingLedger[],
  hashes: OfficialPenaltyShotContextProof["hashes"],
): OfficialPenaltyShotContextProof {
  const game = raw as Game,
    box = rawBox as {
      id: number;
      homeTeam: { id: number; sog: number; score: number };
      awayTeam: { id: number; sog: number; score: number };
      playerByGameStats: Record<
        string,
        Record<string, Array<Record<string, unknown>>>
      >;
    };
  if (
    game.id !== 2009020519 ||
    game.gameType !== 2 ||
    game.gameState !== "OFF" ||
    box.id !== game.id ||
    box.homeTeam.id !== game.homeTeam.id ||
    box.awayTeam.id !== game.awayTeam.id ||
    totals.length !== 1 ||
    totals[0]!.gameId !== game.id ||
    totals[0]!.gameDate !== game.gameDate ||
    totals[0]!.penaltyShotAttempts !== 1 ||
    totals[0]!.penaltyShotsGoals !== 0 ||
    totals[0]!.penaltyShotsFailed !== 1 ||
    !Object.values(hashes).every((h) => /^[a-f0-9]{64}$/.test(h))
  )
    throw Error("Unsupported missing-native PS source scope");
  if (
    new Set(game.plays.map((p) => p.eventId)).size !== game.plays.length ||
    game.plays.some((p) => !count(p.eventId) || !count(p.sortOrder)) ||
    new Set(game.rosterSpots.map((p) => p.playerId)).size !==
      game.rosterSpots.length
  )
    throw Error("Duplicate/invalid missing-native PS source identities");
  const boxIds = new Set<number>();
  for (const [side, team] of [
    ["homeTeam", game.homeTeam.id],
    ["awayTeam", game.awayTeam.id],
  ] as const)
    for (const [group, players] of Object.entries(box.playerByGameStats[side]!))
      for (const p of players) {
        const id = p.playerId,
          roster = game.rosterSpots.filter(
            (r) => r.playerId === id && r.teamId === team,
          );
        if (
          !count(id) ||
          boxIds.has(id) ||
          roster.length !== 1 ||
          (group === "goalies") !== (roster[0]!.positionCode === "G") ||
          (group === "defense") !== (roster[0]!.positionCode === "D")
        )
          throw Error("Missing-native PS box/roster identity mismatch");
        boxIds.add(id);
      }
  const page = load(html),
    clean = (s: string) => s.replace(/\s+/g, " ").trim(),
    cells = page("td")
      .toArray()
      .map((td) => clean(page(td).text()));
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(game.gameDate + "T00:00:00Z"));
  if (
    !/Play By Play/i.test(page("title").text()) ||
    !cells.includes(date) ||
    !cells.some(
      (s) =>
        /^Game\s+\d+$/.test(s) &&
        Number(s.match(/\d+/)![0]) === game.id % 10000,
    )
  )
    throw Error("Wrong missing-native PS report identity");
  const records = page("tr")
    .toArray()
    .flatMap((tr) => {
      const c = page(tr)
        .children("td")
        .toArray()
        .map((td) => clean(page(td).text()));
      const clock = c[3]?.match(/^(\d+:\d{2})/);
      return c.length === 8 &&
        /^\d+$/.test(c[0]!) &&
        /^\d+$/.test(c[1]!) &&
        clock
        ? [
            {
              ordinal: Number(c[0]),
              period: Number(c[1]),
              second: clockSeconds(clock[1]),
              kind: c[4]!,
              description: c[5]!,
              away: c[6]!,
              home: c[7]!,
            },
          ]
        : [];
    });
  if (new Set(records.map((r) => r.ordinal)).size !== records.length)
    throw Error("Duplicate missing-native PS report ordinal");
  const labels = records.filter(
    (r) =>
      ["SHOT", "MISS", "GOAL"].includes(r.kind) &&
      /Penalty Shot/i.test(r.description),
  );
  if (
    labels.length !== 1 ||
    labels[0]!.kind !== "SHOT" ||
    labels[0]!.period !== 3
  )
    throw Error("Ambiguous missing-native terminal PS report");
  const terminal = labels[0]!,
    roster = game.rosterSpots.filter(
      (p) => p.playerId === totals[0]!.playerId && p.positionCode !== "G",
    ),
    label = terminal.description.match(
      /^([A-Z.]+) ONGOAL - #(\d+)\s+([^,]+), Penalty Shot, Snap, Off\. Zone, \d+ ft\.$/,
    );
  if (
    roster.length !== 1 ||
    !label ||
    Number(label[2]) !== roster[0]!.sweaterNumber ||
    normalize(label[3]!) !== normalize(roster[0]!.lastName.default)
  )
    throw Error("Missing-native PS shooter/report mismatch");
  const shooter = roster[0]!,
    home = shooter.teamId === game.homeTeam.id,
    own = home ? game.homeTeam : game.awayTeam,
    opponent = home ? game.awayTeam : game.homeTeam;
  if (
    ![game.homeTeam.id, game.awayTeam.id].includes(shooter.teamId) ||
    normalize(label[1]!) !== normalize(own.abbrev) ||
    normalize(totals[0]!.teamAbbrev ?? "") !== normalize(own.abbrev) ||
    normalize(totals[0]!.opponentTeamAbbrev ?? "") !==
      normalize(opponent.abbrev) ||
    (home ? terminal.home : terminal.away) !==
      `${shooter.sweaterNumber} ${shooter.positionCode}`
  )
    throw Error("Missing-native PS team or isolated offense mismatch");
  const defense = (home ? terminal.away : terminal.home).match(/^(\d+) G$/),
    goalies = game.rosterSpots.filter(
      (p) =>
        p.teamId === opponent.id &&
        p.positionCode === "G" &&
        p.sweaterNumber === Number(defense?.[1]),
    );
  if (!defense || goalies.length !== 1)
    throw Error("Missing-native PS isolated goalie unverified");
  const goalie = goalies[0]!,
    index = records.indexOf(terminal),
    awardReport = records[index - 1],
    faceoffReport = records[index + 1];
  if (
    !awardReport ||
    !faceoffReport ||
    awardReport.ordinal + 1 !== terminal.ordinal ||
    terminal.ordinal + 1 !== faceoffReport.ordinal ||
    awardReport.kind !== "PENL" ||
    faceoffReport.kind !== "FAC" ||
    awardReport.period !== terminal.period ||
    faceoffReport.period !== terminal.period ||
    awardReport.second !== terminal.second ||
    faceoffReport.second !== terminal.second
  )
    throw Error("Missing-native PS report award/resumption order mismatch");
  const awardLabel = awardReport.description.match(
    /^([A-Z.]+) #(\d+)\s+(.+?) PS - Hooking on breakaway\(0 min\), Def\. Zone Drawn By: ([A-Z.]+) #(\d+)\s+(.+)$/,
  );
  const offender = game.rosterSpots.filter(
    (p) =>
      p.teamId === opponent.id &&
      p.sweaterNumber === Number(awardLabel?.[2]) &&
      normalize(p.lastName.default) === normalize(awardLabel?.[3] ?? ""),
  );
  if (
    !awardLabel ||
    offender.length !== 1 ||
    normalize(awardLabel[1]!) !== normalize(opponent.abbrev) ||
    normalize(awardLabel[4]!) !== normalize(own.abbrev) ||
    Number(awardLabel[5]) !== shooter.sweaterNumber ||
    normalize(awardLabel[6]!) !== normalize(shooter.lastName.default)
  )
    throw Error("Missing-native PS report award actors mismatch");
  const same = (p: NativePlay) =>
    p.periodDescriptor.periodType === "REG" &&
    p.periodDescriptor.number === terminal.period &&
    clockSeconds(p.timeInPeriod) === terminal.second;
  const awards = game.plays.filter(
    (p) =>
      same(p) &&
      p.typeDescKey === "penalty" &&
      p.details?.typeCode === "PS" &&
      Number(p.details.drawnByPlayerId) === shooter.playerId &&
      Number(p.details.committedByPlayerId) === offender[0]!.playerId &&
      Number(p.details.eventOwnerTeamId) === opponent.id &&
      p.details.duration === 0 &&
      p.details.descKey === "ps-hooking-on-breakaway",
  );
  const faces = game.plays.filter(
    (p) => same(p) && p.typeDescKey === "faceoff",
  );
  const fac = faceoffReport.description.match(
    /^([A-Z.]+) won Def\. Zone - ([A-Z.]+) #(\d+)\s+(.+?) vs ([A-Z.]+) #(\d+)\s+(.+)$/,
  );
  const facePlayer = (
    abbr: string | undefined,
    num: string | undefined,
    name: string | undefined,
  ) =>
    game.rosterSpots.filter(
      (p) =>
        p.teamId ===
          (normalize(abbr ?? "") === normalize(own.abbrev)
            ? own.id
            : normalize(abbr ?? "") === normalize(opponent.abbrev)
              ? opponent.id
              : -1) &&
        p.sweaterNumber === Number(num) &&
        normalize(p.lastName.default) === normalize(name ?? ""),
    );
  const winner = facePlayer(fac?.[2], fac?.[3], fac?.[4]),
    loser = facePlayer(fac?.[5], fac?.[6], fac?.[7]);
  if (
    awards.length !== 1 ||
    faces.length !== 1 ||
    !fac ||
    normalize(fac[1]!) !== normalize(opponent.abbrev) ||
    winner.length !== 1 ||
    loser.length !== 1 ||
    winner[0]!.teamId !== opponent.id ||
    loser[0]!.teamId !== own.id ||
    Number(faces[0]!.details?.winningPlayerId) !== winner[0]!.playerId ||
    Number(faces[0]!.details?.losingPlayerId) !== loser[0]!.playerId ||
    Number(faces[0]!.details?.eventOwnerTeamId) !== opponent.id
  )
    throw Error("Missing-native PS native award/faceoff mismatch");
  const side = box.playerByGameStats[home ? "homeTeam" : "awayTeam"]!,
    other = box.playerByGameStats[home ? "awayTeam" : "homeTeam"]!;
  const shooterBoxes = [
      ...(side.forwards ?? []),
      ...(side.defense ?? []),
    ].filter((p) => p.playerId === shooter.playerId),
    goalieBoxes = (other.goalies ?? []).filter(
      (p) => p.playerId === goalie.playerId,
    );
  if (
    shooterBoxes.length !== 1 ||
    goalieBoxes.length !== 1 ||
    shooterBoxes[0]!.sog !== 1 ||
    !count(goalieBoxes[0]!.shotsAgainst) ||
    Number(goalieBoxes[0]!.shotsAgainst) < 1
  )
    throw Error("Missing-native PS official shooter/goalie counts unavailable");
  const proof: OfficialPenaltyShotContextProof = {
    version: V4,
    contextProofClass: "missing-native-terminal-saved-ps",
    gameId: game.id,
    penaltyShotEventIds: [2000000000 + terminal.ordinal],
    unclassifiedEventIds: [],
    shooter: shooter.playerId,
    goalie: goalie.playerId,
    period: terminal.period,
    second: terminal.second,
    reportOrdinals: {
      award: awardReport.ordinal,
      penaltyShot: terminal.ordinal,
      followingFaceoff: faceoffReport.ordinal,
    },
    missingNative: {
      eventId: 2000000000 + terminal.ordinal,
      sortOrder: awards[0]!.sortOrder + 1,
      awardEventId: awards[0]!.eventId,
      followingFaceoffEventId: faces[0]!.eventId,
      ownerTeamId: own.id,
      shotType: "snap",
    },
    officialShooterShots: 1,
    officialGoalieShots: Number(goalieBoxes[0]!.shotsAgainst),
    hashes: { ...hashes },
    interpretation:
      "Exact official saved terminal penalty shot missing from native PBP; derived report-ordinal identity, verified award/isolated actors/resumption and one-shot official conservation. No geometry, ordinary xG, goal or extra attempt is invented; one earlier-season PS prior applies.",
  };
  const corrected = applyMissingNativePenaltyShot(
    raw,
    proof,
    hashes.pbpSha256,
  ) as Game;
  const onGoal = corrected.plays.filter(
    (p) =>
      p.periodDescriptor.periodType !== "SO" &&
      ["goal", "shot-on-goal"].includes(p.typeDescKey),
  );
  for (const [side, team] of [
    ["homeTeam", game.homeTeam],
    ["awayTeam", game.awayTeam],
  ] as const) {
    const teamBox = box[side],
      stats = box.playerByGameStats[side];
    if (
      !stats ||
      !count(teamBox.sog) ||
      !count(teamBox.score) ||
      teamBox.score !== team.score ||
      teamBox.sog !==
        onGoal.filter((p) => Number(p.details?.eventOwnerTeamId) === team.id)
          .length ||
      teamBox.score !==
        onGoal.filter(
          (p) =>
            p.typeDescKey === "goal" &&
            Number(p.details?.eventOwnerTeamId) === team.id,
        ).length
    )
      throw Error(
        "Missing-native PS official team SOG/goals conservation failed",
      );
    for (const p of [...(stats.forwards ?? []), ...(stats.defense ?? [])]) {
      if (
        !count(p.sog) ||
        !count(p.goals) ||
        p.sog !==
          onGoal.filter(
            (e) =>
              Number(
                e.details?.shootingPlayerId ?? e.details?.scoringPlayerId,
              ) === p.playerId,
          ).length ||
        p.goals !==
          onGoal.filter(
            (e) =>
              e.typeDescKey === "goal" &&
              Number(e.details?.scoringPlayerId) === p.playerId,
          ).length
      )
        throw Error(
          "Missing-native PS all-skater shot/goal conservation failed",
        );
    }
    for (const p of stats.goalies ?? []) {
      if (
        !count(p.shotsAgainst) ||
        !count(p.goalsAgainst) ||
        p.shotsAgainst !==
          onGoal.filter((e) => Number(e.details?.goalieInNetId) === p.playerId)
            .length ||
        p.goalsAgainst !==
          onGoal.filter(
            (e) =>
              e.typeDescKey === "goal" &&
              Number(e.details?.goalieInNetId) === p.playerId,
          ).length
      )
        throw Error("Missing-native PS all-goalie conservation failed");
    }
  }
  if (
    proof.officialShooterShots !== 1 ||
    proof.officialGoalieShots < 1 ||
    !penaltyShotGameMatches(corrected, totals)
  )
    throw Error("Missing-native PS official attempt conservation failed");
  const classified = parseOfficialPenaltyShots(html, corrected, totals);
  if (classified.length !== 1 || classified[0] !== proof.penaltyShotEventIds[0])
    throw Error("Missing-native PS final report ledger failed");
  return proof;
}

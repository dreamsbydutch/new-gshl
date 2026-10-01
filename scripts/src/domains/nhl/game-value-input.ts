import { parseCsv } from "../ranking/nhl-rating-diagnostics";
import type { ShotTrainingRow } from "../../runtime/nhl-shot-quality";

export type Shot = {
  gameId: number;
  period: number;
  second: number;
  home: boolean;
  kind: string;
  xg: number;
  shooter: number;
  goalie: number;
};
export type GamePlayer = {
  id: number;
  name: string;
  team: number;
  position: "F" | "D" | "G";
  seconds: number;
  shotsAgainst: number;
  goalsAgainst: number;
};
export type ValueStint = {
  gameId: number;
  date: string;
  seconds: number;
  home: number[];
  away: number[];
  homeGoalie: number | null;
  awayGoalie: number | null;
  situation: string;
  homeXg: number;
  awayXg: number;
  homeGoals: number;
  awayGoals: number;
  score: number;
  homeZone: number;
  usableForProcess?: boolean;
};
export type VerifiedShot = Shot & {
  eventId: number;
  attribution: "lineup" | "individual-only" | "penalty-shot";
  penaltyCommitted?: number | null;
  penaltyDrawn?: number | null;
  shooter: number;
  goalie: number;
  situation: string;
  homePlayers: number[];
  awayPlayers: number[];
  probabilitySource: "moneypuck" | "nhl-event-xg-v1" | "nhl-penalty-shot-v1";
};
export type PenaltyEvent = {
  eventId: number;
  second: number;
  team: number;
  committed: number | null;
  drawn: number | null;
  minutes: number;
  kind: "minor" | "double-minor" | "major";
  homeBefore: number | null;
  awayBefore: number | null;
  regularSeasonOvertime: boolean;
  remainingSeconds: number | null;
};
export type GameValueData = {
  shiftSource: "nhl-api" | "nhl-toi-report";
  gameId: number;
  date: string;
  homeTeam: number;
  awayTeam: number;
  homeGoals: number;
  awayGoals: number;
  players: GamePlayer[];
  stints: ValueStint[];
  shots: VerifiedShot[];
  penalties: PenaltyEvent[];
  issues: string[];
  corrections: string[];
  gameSeconds: number;
  modeledSeconds: number;
  officialShots: number;
  matchedShots: number;
  usableProcessSeconds: number;
  shotCoverageByPlayer: Record<
    number,
    { expected: number; matched: number; missingGoals: number }
  >;
  eligible: boolean;
  shotRejections: Array<{ eventId: number; reason: string }>;
  goalieReconciliation: Array<{
    playerId: number;
    verifiedShots: number;
    officialShots: number;
    verifiedGoals: number;
    officialGoals: number;
  }>;
};
type RecordValue = Record<string, unknown>;
const object = (v: unknown): RecordValue => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Expected hockey source object");
  return v as RecordValue;
};
const array = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw new Error("Expected hockey source array");
  return v;
};
const num = (v: unknown): number => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n))
    throw new Error("Invalid hockey source number");
  return n;
};
export function clockSeconds(v: unknown): number {
  if (typeof v !== "string" || !/^\d+:\d{2}$/.test(v))
    throw new Error("Invalid hockey clock");
  const [m, s] = v.split(":").map(Number);
  if (s! >= 60) throw new Error("Invalid clock seconds");
  return m! * 60 + s!;
}

/** Chunking bounds temporary CSV objects while retaining only modeling fields. */
export function parseShotFile(
  text: string,
  season: number,
): Map<number, Shot[]> {
  const lines = text.split(/\r?\n/),
    header = lines.shift()!;
  const games = new Map<number, Shot[]>();
  const year = Math.floor(season / 10000);
  for (let start = 0; start < lines.length; start += 1000)
    for (const row of parseCsv(
      header + "\n" + lines.slice(start, start + 1000).join("\n"),
    )) {
      if (num(row.season) !== year) throw new Error("Mixed shot-file season");
      const suffix = num(row.game_id),
        period = num(row.period),
        time = num(row.time);
      const gameId = suffix > 1e9 ? suffix : year * 1e6 + suffix;
      const xg = num(row.xGoal);
      if (
        xg < 0 ||
        xg > 1 ||
        !Number.isInteger(gameId) ||
        !Number.isInteger(period) ||
        period < 1
      )
        throw new Error("Invalid shot probability/identity");
      const second = time - (period - 1) * 1200;
      if (second < 0 || second > 1200)
        throw new Error("Unexpected shot time convention");
      const list = games.get(gameId) ?? [];
      list.push({
        gameId,
        period,
        second,
        xg,
        home: num(row.isHomeTeam) === 1,
        kind: String(row.event),
        shooter: Number(row.shooterPlayerId) || 0,
        goalie: Number(row.goalieIdForShot) || 0,
      });
      games.set(gameId, list);
    }
  return games;
}

type Play = {
  id: number;
  period: number;
  second: number;
  order: number;
  kind: string;
  situation: string;
  details: RecordValue;
};
type Shift = {
  player: number;
  team: number;
  period: number;
  start: number;
  end: number;
};
const shotKind: Record<string, string> = {
  "shot-on-goal": "SHOT",
  "missed-shot": "MISS",
  "failed-shot-attempt": "MISS",
  goal: "GOAL",
};

/** Explicit NHL penalty-shot awards/codes; shootouts never enter these observations. */
function penaltyShotAwards(plays: Play[]) {
  const result = new Map<number, Play | undefined>();
  const awards = plays
    .filter((q) => q.kind === "penalty" && q.details.typeCode === "PS")
    .reverse();
  const used = new Set<number>();
  for (const p of plays.filter((p) => shotKind[p.kind])) {
    const award = awards.find(
      (q) =>
        !used.has(q.id) &&
        q.period === p.period &&
        q.second === p.second &&
        q.order < p.order &&
        q.details.eventOwnerTeamId !== p.details.eventOwnerTeamId &&
        !plays.some(
          (faceoff) =>
            faceoff.kind === "faceoff" &&
            faceoff.order > q.order &&
            faceoff.order < p.order,
        ),
    );
    if (["1010", "0101"].includes(p.situation) || award) {
      result.set(p.id, award);
      if (award) used.add(award.id);
    }
  }
  return result;
}

function officialPlays(pbp: RecordValue): Play[] {
  return array(pbp.plays)
    .flatMap((raw) => {
      const p = object(raw),
        descriptor = object(p.periodDescriptor);
      if (descriptor.periodType === "SO") return [];
      return [
        {
          id: num(p.eventId),
          period: num(descriptor.number),
          second: clockSeconds(p.timeInPeriod),
          order: num(p.sortOrder),
          kind: String(p.typeDescKey),
          situation: String(p.situationCode ?? ""),
          details: p.details ? object(p.details) : {},
        },
      ];
    })
    .sort((a, b) => a.order - b.order);
}

export function extractShotTrainingRows(raw: unknown): ShotTrainingRow[] {
  const pbp = object(raw),
    gameId = num(pbp.id),
    homeId = num(object(pbp.homeTeam).id);
  const rows: ShotTrainingRow[] = [];
  const eventIds = new Set<number>();
  const penaltyShots = penaltyShotAwards(officialPlays(pbp));
  let previous:
    | { time: number; team: number; kind: string; zone: string }
    | undefined;
  for (const event of array(pbp.plays)
    .map(object)
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))) {
    const descriptor = object(event.periodDescriptor);
    if (descriptor.periodType === "SO") continue;
    const eventId = num(event.eventId);
    if (eventIds.has(eventId))
      throw new Error("Duplicate official event identities");
    eventIds.add(eventId);
    const time =
        (num(descriptor.number) - 1) * 1200 + clockSeconds(event.timeInPeriod),
      details = event.details ? object(event.details) : {};
    const kind = String(event.typeDescKey),
      team = Number(details.eventOwnerTeamId);
    if (
      shotKind[kind] &&
      kind !== "failed-shot-attempt" &&
      !penaltyShots.has(eventId) &&
      typeof details.xCoord === "number" &&
      typeof details.yCoord === "number" &&
      /^\d{4}$/.test(String(event.situationCode))
    ) {
      const home = team === homeId,
        code = String(event.situationCode);
      const x = details.xCoord,
        y = details.yCoord;
      const homeAttacksRight = event.homeTeamDefendingSide === "left";
      if (
        !["left", "right"].includes(String(event.homeTeamDefendingSide)) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
      )
        continue;
      const oriented = (home === homeAttacksRight ? 1 : -1) * x;
      const distance = Math.hypot(89 - oriented, y),
        angle = (Math.atan2(Math.abs(y), 89 - oriented) * 180) / Math.PI;
      const elapsed = previous ? time - previous.time : Infinity,
        sameTeam = previous?.team === team;
      const type = String(details.shotType ?? "unknown");
      const features = [
        1,
        distance / 100,
        distance ** 2 / 10000,
        angle / 90,
        angle ** 2 / 8100,
        sameTeam &&
        elapsed >= 0 &&
        elapsed <= 3 &&
        previous &&
        ["shot-on-goal", "missed-shot", "blocked-shot"].includes(previous.kind)
          ? 1
          : 0,
        sameTeam && elapsed >= 0 && elapsed <= 5 && previous?.zone !== "O"
          ? 1
          : 0,
        Number(home ? code[0] === "0" : code[3] === "0"),
        home
          ? Number(code[2]) - Number(code[1])
          : Number(code[1]) - Number(code[2]),
        ...[
          "backhand",
          "slap",
          "tip-in",
          "deflected",
          "wrap-around",
          "snap",
        ].map((t) => Number(type === t)),
        Number(
          ![
            "wrist",
            "backhand",
            "slap",
            "tip-in",
            "deflected",
            "wrap-around",
            "snap",
          ].includes(type),
        ),
      ];
      rows.push({
        gameId,
        date: String(pbp.gameDate),
        eventId: num(event.eventId),
        goal: kind === "goal" ? 1 : 0,
        features,
      });
    }
    previous = { time, team, kind, zone: String(details.zoneCode ?? "") };
  }
  return rows;
}

/** Rebuild exposures from official shifts and identities; match xG to official events, not provider names. */
export function buildGameValueData(
  sources: {
    pbp: unknown;
    box: unknown;
    shifts: unknown[];
    shiftSource?: "nhl-api" | "nhl-toi-report";
  },
  providerShots: Shot[],
  localProbabilities?: Map<number, number>,
  penaltyShotProbability?: number,
): GameValueData {
  const pbp = object(sources.pbp),
    box = object(sources.box);
  const gameId = num(pbp.id);
  if (num(box.id) !== gameId || providerShots.some((s) => s.gameId !== gameId))
    throw new Error("Mixed game sources");
  const homeTeam = num(object(pbp.homeTeam).id),
    awayTeam = num(object(pbp.awayTeam).id);
  const players: GamePlayer[] = [];
  const stats = object(box.playerByGameStats);
  for (const [side, team] of [
    ["homeTeam", homeTeam],
    ["awayTeam", awayTeam],
  ] as const) {
    const rows = object(stats[side]);
    for (const group of ["forwards", "defense", "goalies"])
      for (const raw of array(rows[group])) {
        const p = object(raw),
          seconds = clockSeconds(p.toi);
        if (!seconds) continue;
        const id = num(p.playerId);
        if (!Number.isInteger(id) || players.some((x) => x.id === id))
          throw new Error("Duplicate/invalid boxscore identity");
        players.push({
          id,
          name: String(object(p.name).default),
          team,
          position: group === "goalies" ? "G" : group === "defense" ? "D" : "F",
          seconds,
          shotsAgainst: Number(p.shotsAgainst) || 0,
          goalsAgainst: Number(p.goalsAgainst) || 0,
        });
      }
  }
  const roster = new Map(players.map((p) => [p.id, p]));
  const plays = officialPlays(pbp);
  const penaltyShots = penaltyShotAwards(plays);
  const isModeledShot = (p: Play) =>
    Boolean(shotKind[p.kind]) &&
    (p.kind !== "failed-shot-attempt" || penaltyShots.has(p.id));
  if (new Set(plays.map((p) => p.id)).size !== plays.length)
    throw new Error("Duplicate official event identities");
  const result: GameValueData = {
    shiftSource: sources.shiftSource ?? "nhl-api",
    gameId,
    date: String(box.gameDate),
    homeTeam,
    awayTeam,
    homeGoals: plays.filter(
      (p) => p.kind === "goal" && p.details.eventOwnerTeamId === homeTeam,
    ).length,
    awayGoals: plays.filter(
      (p) => p.kind === "goal" && p.details.eventOwnerTeamId === awayTeam,
    ).length,
    players,
    stints: [],
    shots: [],
    penalties: [],
    issues: [],
    corrections: [],
    gameSeconds: 0,
    modeledSeconds: 0,
    officialShots: plays.filter(isModeledShot).length,
    matchedShots: 0,
    usableProcessSeconds: 0,
    shotCoverageByPlayer: {},
    eligible: false,
    shotRejections: [],
    goalieReconciliation: [],
  };
  const shifts: Shift[] = [];
  const unknownShifts: Array<{ period: number; start: number; end: number }> =
    [];
  for (const raw of sources.shifts) {
    const s = object(raw);
    if (num(s.gameId) !== gameId) throw new Error("Mixed shift games");
    if (s.typeCode !== 517) continue;
    const player = num(s.playerId),
      team = num(s.teamId),
      start = clockSeconds(s.startTime),
      end = clockSeconds(s.endTime);
    if (end <= start) continue;
    if (!roster.has(player) || roster.get(player)!.team !== team) {
      unknownShifts.push({ period: num(s.period), start, end });
      result.issues.push(
        `shift player ${player} absent from official played roster`,
      );
      continue;
    }
    shifts.push({ player, team, period: num(s.period), start, end });
  }
  const periods = [...new Set(plays.map((p) => p.period))].sort(
    (a, b) => a - b,
  );
  let score = 0;
  const intervals: Array<{
    period: number;
    start: number;
    end: number;
    stint: ValueStint;
  }> = [];
  for (const period of periods) {
    const events = plays.filter((p) => p.period === period);
    const end =
      period <= 3 ? 1200 : Math.max(0, ...events.map((p) => p.second));
    result.gameSeconds += end;
    const periodShifts = shifts.filter((s) => s.period === period);
    const boundaries = [
      ...new Set([
        0,
        end,
        ...periodShifts.flatMap((s) => [s.start, s.end]),
        ...events
          .filter((p) => ["goal", "faceoff"].includes(p.kind))
          .map((p) => p.second),
      ]),
    ]
      .filter((t) => t >= 0 && t <= end)
      .sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i]!,
        stop = boundaries[i + 1]!;
      const active = [
        ...new Set(
          periodShifts
            .filter((s) => s.start <= start && s.end >= stop)
            .map((s) => s.player),
        ),
      ].map((id) => roster.get(id)!);
      const home = active
        .filter((p) => p.team === homeTeam && p.position !== "G")
        .map((p) => p.id)
        .sort((a, b) => a - b);
      const away = active
        .filter((p) => p.team === awayTeam && p.position !== "G")
        .map((p) => p.id)
        .sort((a, b) => a - b);
      const hg = active.filter(
          (p) => p.team === homeTeam && p.position === "G",
        ),
        ag = active.filter((p) => p.team === awayTeam && p.position === "G");
      const precedingGoals = events.filter(
        (p) => p.kind === "goal" && p.second <= start,
      );
      const localScore =
        score +
        precedingGoals.reduce(
          (n, p) => n + (p.details.eventOwnerTeamId === homeTeam ? 1 : -1),
          0,
        );
      if (
        home.length < 3 ||
        away.length < 3 ||
        home.length > 6 ||
        away.length > 6 ||
        hg.length > 1 ||
        ag.length > 1 ||
        (hg.length && home.length > 5) ||
        (ag.length && away.length > 5)
      )
        continue;
      const faceoff = events.find(
        (p) => p.kind === "faceoff" && p.second === start,
      );
      const zone =
        faceoff?.details.zoneCode === "O"
          ? 1
          : faceoff?.details.zoneCode === "D"
            ? -1
            : 0;
      const homeZone =
        faceoff?.details.eventOwnerTeamId === homeTeam ? zone : -zone;
      const situation = `${home.length}v${away.length}:${hg.length ? "G" : "E"}${ag.length ? "G" : "E"}`;
      const stint: ValueStint = {
        gameId,
        date: result.date,
        seconds: stop - start,
        home,
        away,
        homeGoalie: hg[0]?.id ?? null,
        awayGoalie: ag[0]?.id ?? null,
        situation,
        homeXg: 0,
        awayXg: 0,
        homeGoals: 0,
        awayGoals: 0,
        score: Math.max(-3, Math.min(3, localScore)),
        homeZone,
      };
      result.stints.push(stint);
      intervals.push({ period, start, end: stop, stint });
      result.modeledSeconds += stop - start;
    }
    score += events
      .filter((p) => p.kind === "goal")
      .reduce(
        (n, p) => n + (p.details.eventOwnerTeamId === homeTeam ? 1 : -1),
        0,
      );
  }
  const unused = new Set(providerShots.map((_, i) => i));
  for (const p of plays.filter(isModeledShot)) {
    const home = p.details.eventOwnerTeamId === homeTeam;
    const shooter = Number(
      p.details.shootingPlayerId ?? p.details.scoringPlayerId,
    );
    const matches = [...unused].filter((i) => {
      const s = providerShots[i]!;
      return (
        s.period === p.period &&
        s.second === p.second &&
        s.home === home &&
        s.kind === shotKind[p.kind]
      );
    });
    const exact = matches.filter((i) => providerShots[i]!.shooter === shooter);
    const match =
      exact.length === 1
        ? exact[0]
        : matches.length === 1
          ? matches[0]
          : undefined;
    if (penaltyShots.has(p.id)) {
      if (match !== undefined) unused.delete(match);
      const goalie = Number(p.details.goalieInNetId),
        award = penaltyShots.get(p.id);
      if (
        penaltyShotProbability === undefined ||
        !Number.isFinite(penaltyShotProbability) ||
        penaltyShotProbability <= 0 ||
        penaltyShotProbability >= 1 ||
        roster.get(shooter)?.team !== (home ? homeTeam : awayTeam) ||
        roster.get(goalie)?.position !== "G" ||
        roster.get(goalie)?.team !== (home ? awayTeam : homeTeam)
      ) {
        result.shotRejections.push({
          eventId: p.id,
          reason:
            "Penalty shot lacks a prior baseline or verified shooter/goalie identity",
        });
        continue;
      }
      const committed = Number(award?.details.committedByPlayerId),
        drawn = Number(award?.details.drawnByPlayerId);
      result.shots.push({
        gameId,
        eventId: p.id,
        period: p.period,
        second: p.second,
        home,
        kind: shotKind[p.kind]!,
        shooter,
        goalie,
        xg: penaltyShotProbability,
        situation: "PS",
        homePlayers: [],
        awayPlayers: [],
        attribution: "penalty-shot",
        probabilitySource: "nhl-penalty-shot-v1",
        penaltyCommitted:
          roster.get(committed)?.team === (home ? awayTeam : homeTeam)
            ? committed
            : null,
        penaltyDrawn:
          roster.get(drawn)?.team === (home ? homeTeam : awayTeam)
            ? drawn
            : null,
      });
      result.matchedShots++;
      continue;
    }
    if (
      (!localProbabilities && match === undefined) ||
      (localProbabilities && !localProbabilities.has(p.id))
    ) {
      result.shotRejections.push({
        eventId: p.id,
        reason: "Missing or ambiguous shot probability",
      });
      continue;
    }
    if (match !== undefined) unused.delete(match);
    const raw: Shot = localProbabilities
      ? {
          gameId,
          period: p.period,
          second: p.second,
          home,
          kind: shotKind[p.kind]!,
          shooter,
          goalie: Number(p.details.goalieInNetId) || 0,
          xg: localProbabilities.get(p.id)!,
        }
      : providerShots[match!]!;
    if (!Number.isFinite(raw.xg) || raw.xg < 0 || raw.xg > 1)
      throw new Error("Invalid event xG probability");
    const code = /^\d{4}$/.test(p.situation) ? p.situation : null;
    // Individual shot credit does not require guessing the other nine skaters.
    const individualShot = (reason: string) => {
      result.shotRejections.push({ eventId: p.id, reason });
      const goalie = Number(p.details.goalieInNetId) || 0;
      const empty = code && (home ? code[0] : code[3]) === "0";
      if (
        roster.get(shooter)?.team !== (home ? homeTeam : awayTeam) ||
        (goalie
          ? roster.get(goalie)?.position !== "G" ||
            roster.get(goalie)?.team !== (home ? awayTeam : homeTeam)
          : !empty)
      )
        return;
      result.shots.push({
        ...raw,
        eventId: p.id,
        shooter,
        goalie,
        homePlayers: [],
        awayPlayers: [],
        situation: p.situation,
        attribution: "individual-only",
        probabilitySource: localProbabilities ? "nhl-event-xg-v1" : "moneypuck",
      });
    };
    const candidates = intervals.filter(
      (s) =>
        s.period === p.period &&
        s.start <= p.second &&
        s.end >= p.second &&
        ((home ? s.stint.home : s.stint.away).includes(shooter) ||
          (home ? s.stint.homeGoalie : s.stint.awayGoalie) === shooter) &&
        (!code ||
          (s.stint.home.length === Number(code[2]) &&
            s.stint.away.length === Number(code[1]) &&
            Number(s.stint.homeGoalie !== null) === Number(code[3]) &&
            Number(s.stint.awayGoalie !== null) === Number(code[0]))),
    );
    // A shot at a stoppage belongs to the ending shift, unless official manpower/shooter rules it out.
    const interval =
      candidates.find((s) => s.end === p.second) ?? candidates[0];
    if (!interval) {
      individualShot(
        `Official shooter/manpower cannot be reconciled to shifts at ${p.period}/${p.second} (${p.situation}); individual credit retained when identities verify`,
      );
      continue;
    }
    const stint = interval.stint;
    const goalie = (home ? stint.awayGoalie : stint.homeGoalie) ?? 0;
    if (p.details.goalieInNetId && p.details.goalieInNetId !== goalie) {
      individualShot(
        "Official event goalie disagrees with shifts; individual credit retained when identities verify",
      );
      continue;
    }
    if (raw.shooter !== shooter)
      result.corrections.push(
        `event ${p.id}: shooter ${raw.shooter} -> NHL ${shooter}`,
      );
    if (raw.goalie !== goalie)
      result.corrections.push(
        `event ${p.id}: goalie ${raw.goalie} -> NHL ${goalie}`,
      );
    const shot: VerifiedShot = {
      ...raw,
      eventId: p.id,
      attribution: "lineup",
      shooter,
      goalie,
      homePlayers: stint.home,
      awayPlayers: stint.away,
      situation: stint.situation,
      probabilitySource: localProbabilities ? "nhl-event-xg-v1" : "moneypuck",
    };
    result.shots.push(shot);
    result.matchedShots++;
    if (home) {
      stint.homeXg += raw.xg;
      stint.homeGoals += p.kind === "goal" ? 1 : 0;
    } else {
      stint.awayXg += raw.xg;
      stint.awayGoals += p.kind === "goal" ? 1 : 0;
    }
  }
  if (!localProbabilities && unused.size)
    result.issues.push(
      `${unused.size} provider shots unmatched to official events`,
    );
  for (const p of plays.filter((p) => p.kind === "penalty")) {
    const duration = Number(p.details.duration),
      type = String(p.details.typeCode);
    if (
      !(
        (["MIN", "BEN"].includes(type) && duration === 2) ||
        (["DBL", "MIN"].includes(type) && duration === 4) ||
        (["MAJ", "MAT"].includes(type) && duration === 5)
      )
    )
      continue;
    const code = /^[01][3-6][3-6][01]$/.test(p.situation) ? p.situation : null;
    const regularSeasonOvertime =
      Math.floor(gameId / 10000) % 100 === 2 && p.period === 4;
    const precedingGoals = plays.filter(
      (q) => q.kind === "goal" && q.order < p.order,
    );
    const scoreBefore = precedingGoals.reduce(
      (n, q) => n + (q.details.eventOwnerTeamId === homeTeam ? 1 : -1),
      0,
    );
    const gameAlreadyEnded =
      (p.period === 3 && p.second === 1200 && scoreBefore !== 0) ||
      precedingGoals.some((q) => q.period >= 4);
    result.penalties.push({
      eventId: p.id,
      second: (p.period - 1) * 1200 + p.second,
      team: num(p.details.eventOwnerTeamId),
      committed: roster.has(Number(p.details.committedByPlayerId))
        ? Number(p.details.committedByPlayerId)
        : null,
      drawn: roster.has(Number(p.details.drawnByPlayerId))
        ? Number(p.details.drawnByPlayerId)
        : null,
      minutes: duration,
      kind:
        duration === 5 ? "major" : duration === 4 ? "double-minor" : "minor",
      // A pulled goalie adds a skater; restore the goalie before measuring the penalty's manpower effect.
      homeBefore: code ? Number(code[2]) - Number(code[3] === "0") : null,
      awayBefore: code ? Number(code[1]) - Number(code[0] === "0") : null,
      regularSeasonOvertime,
      remainingSeconds: gameAlreadyEnded
        ? 0
        : regularSeasonOvertime
          ? Math.max(0, 300 - p.second)
          : null,
    });
  }
  for (const goalie of players.filter((p) => p.position === "G")) {
    const events = result.shots.filter((s) => s.goalie === goalie.id);
    const verifiedShots = events.filter((s) =>
      ["SHOT", "GOAL"].includes(s.kind),
    ).length;
    const verifiedGoals = events.filter((s) => s.kind === "GOAL").length;
    if (
      verifiedShots !== goalie.shotsAgainst ||
      verifiedGoals !== goalie.goalsAgainst
    ) {
      result.goalieReconciliation.push({
        playerId: goalie.id,
        verifiedShots,
        officialShots: goalie.shotsAgainst,
        verifiedGoals,
        officialGoals: goalie.goalsAgainst,
      });
      if (verifiedGoals !== goalie.goalsAgainst)
        result.issues.push(
          `goalie goals ${goalie.id} disagree with game report`,
        );
      else
        result.issues.push(
          `goalie shots ${goalie.id}: ${verifiedShots} verified vs ${goalie.shotsAgainst} official; event classification/exposure differs`,
        );
    }
  }
  const shotCoverage = result.officialShots
    ? result.matchedShots / result.officialShots
    : 0;
  if (shotCoverage < 0.98)
    result.issues.push(
      `shot attribution coverage ${(100 * shotCoverage).toFixed(2)}%`,
    );
  if (!result.gameSeconds || result.modeledSeconds / result.gameSeconds < 0.98)
    result.issues.push("shift coverage below 98%");
  const reconstructed = new Map<number, number>();
  for (const s of result.stints)
    for (const id of [
      ...s.home,
      ...s.away,
      ...(s.homeGoalie ? [s.homeGoalie] : []),
      ...(s.awayGoalie ? [s.awayGoalie] : []),
    ])
      reconstructed.set(id, (reconstructed.get(id) ?? 0) + s.seconds);
  const conflictedPlayers = new Set(
    players
      .filter(
        (p) =>
          Math.abs((reconstructed.get(p.id) ?? 0) - p.seconds) >
          Math.max(30, p.seconds * 0.03),
      )
      .map((p) => p.id),
  );
  if (conflictedPlayers.size)
    result.issues.push("reconstructed player TOI disagrees with boxscore");
  const rejected = new Set(result.shotRejections.map((r) => r.eventId));
  const uncertainEvents = plays.filter(
    (p) => rejected.has(p.id) && !penaltyShots.has(p.id),
  );
  const uncertainStints = new Set<ValueStint>();
  for (const p of uncertainEvents) {
    const adjacent = intervals.filter(
      (s) => s.period === p.period && s.start <= p.second && s.end >= p.second,
    );
    const ending = adjacent.find((s) => s.end === p.second);
    for (const interval of ending ? [ending] : adjacent)
      uncertainStints.add(interval.stint);
  }
  for (const interval of intervals) {
    const s = interval.stint;
    s.usableForProcess =
      ![...s.home, ...s.away, s.homeGoalie, s.awayGoalie].some(
        (id) => id !== null && conflictedPlayers.has(id),
      ) &&
      !unknownShifts.some(
        (u) =>
          u.period === interval.period &&
          u.start < interval.end &&
          u.end > interval.start,
      ) &&
      !uncertainStints.has(s);
    if (s.usableForProcess) result.usableProcessSeconds += s.seconds;
  }
  const matchedById = new Map(result.shots.map((s) => [s.eventId, s]));
  for (const p of plays.filter(isModeledShot)) {
    const shooter = Number(
        p.details.shootingPlayerId ?? p.details.scoringPlayerId,
      ),
      goalie = Number(p.details.goalieInNetId);
    for (const id of new Set(
      [shooter, goalie].filter((id) => roster.has(id)),
    )) {
      const count = result.shotCoverageByPlayer[id] ?? {
        expected: 0,
        matched: 0,
        missingGoals: 0,
      };
      count.expected++;
      const shot = matchedById.get(p.id);
      if (shot && (shot.shooter === id || shot.goalie === id)) count.matched++;
      else if (p.kind === "goal") count.missingGoals++;
      result.shotCoverageByPlayer[id] = count;
    }
  }
  if (
    result.shots.filter(
      (s) => s.kind === "GOAL" && s.attribution !== "individual-only",
    ).length !==
    result.homeGoals + result.awayGoals
  )
    result.issues.push("Not every official goal has verified shot attribution");
  result.eligible =
    result.stints.every((s) => s.usableForProcess !== false) &&
    shotCoverage >= 0.98 &&
    result.modeledSeconds / result.gameSeconds >= 0.98 &&
    !result.issues.some(
      (x) =>
        x.startsWith("shift player") ||
        x.startsWith("reconstructed") ||
        x.startsWith("Not every") ||
        x.startsWith("goalie goals"),
    );
  return result;
}

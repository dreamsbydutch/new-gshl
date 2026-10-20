import {
  clockSeconds,
  type GameValueData,
  type VerifiedShot,
} from "./game-value-input";

type Event = {
  id: number;
  order: number;
  period: number | null;
  second: number | null;
  shootout: boolean;
  kind: string;
  team: number | null;
  goalie: number | null;
  reason: string | null;
  situation: string | null;
};
type Opportunity = {
  initialEventId: number;
  goalieId: number;
  attackingTeam: number;
  period: number;
  second: number;
  attempts: Array<{
    eventId: number;
    kind: string;
    secondsAfter: number;
    verified: boolean;
    xg: number | null;
  }>;
  termination: string;
  terminationEventId: number | null;
  stoppageReason: string | null;
  freezeEvidence: "none" | "goalie-stoppage-proxy" | "puck-frozen-unspecified";
  attributableFreeze: false;
};
const object = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const integer = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
const attempts = new Set([
  "shot-on-goal",
  "missed-shot",
  "blocked-shot",
  "goal",
]);
const interruptions = new Set([
  "faceoff",
  "penalty",
  "delayed-penalty",
  "period-end",
  "game-end",
  "period-start",
]);

/** Descriptive opportunity chains only: no model fit, causal attribution or rating credit. */
export function extractGoalieOpportunitySequences(
  game: GameValueData,
  raw: unknown,
) {
  const pbp = object(raw);
  if (!pbp || pbp.id !== game.gameId || !Array.isArray(pbp.plays))
    throw new Error("Opportunity source/game identity mismatch");
  const issues: string[] = [];
  const ids = new Set<number>(),
    orders = new Set<number>();
  const events: Event[] = [];
  const roster = new Map(game.players.map((player) => [player.id, player]));
  const blockedShotActorEvidence: Record<string, number> = {};
  for (const value of pbp.plays) {
    const p = object(value),
      descriptor = object(p?.periodDescriptor),
      details = object(p?.details);
    const id = integer(p?.eventId),
      order = integer(p?.sortOrder);
    if (id === null || order === null || ids.has(id) || orders.has(order)) {
      issues.push("invalid-or-duplicate-event-identity/order");
      continue;
    }
    ids.add(id);
    orders.add(order);
    let second: number | null = null;
    try {
      second = clockSeconds(p?.timeInPeriod);
    } catch {
      issues.push(`invalid-clock:${id}`);
    }
    const kind = typeof p?.typeDescKey === "string" ? p.typeDescKey : "unknown";
    const owner = integer(details?.eventOwnerTeamId);
    let team = owner;
    if (kind === "blocked-shot") {
      const shooter = roster.get(integer(details?.shootingPlayerId) ?? -1);
      const blocker = roster.get(integer(details?.blockingPlayerId) ?? -1);
      const known =
        shooter &&
        blocker &&
        [game.homeTeam, game.awayTeam].includes(shooter.team) &&
        [game.homeTeam, game.awayTeam].includes(blocker.team);
      const evidence = !known
        ? "unknown-actor-team"
        : shooter.team === blocker.team
          ? "same-team-actors-ambiguous"
          : owner === shooter.team
            ? "owner-is-shooting-team"
            : owner === blocker.team
              ? "owner-is-blocking-team"
              : "unknown-owner";
      blockedShotActorEvidence[evidence] =
        (blockedShotActorEvidence[evidence] ?? 0) + 1;
      team =
        known &&
        shooter.team !== blocker.team &&
        [shooter.team, blocker.team].includes(owner ?? -1)
          ? shooter.team
          : null;
    }
    events.push({
      id,
      order,
      period: integer(descriptor?.number),
      second,
      shootout: descriptor?.periodType === "SO",
      kind,
      team,
      goalie: integer(details?.goalieInNetId),
      reason: typeof details?.reason === "string" ? details.reason : null,
      situation: typeof p?.situationCode === "string" ? p.situationCode : null,
    });
  }
  events.sort((a, b) => a.order - b.order);
  const verified = new Map(game.shots.map((s) => [s.eventId, s]));
  if (verified.size !== game.shots.length)
    throw new Error("Duplicate verified opportunity shot identity");
  const eligibleSaves = game.shots.filter(
    (s) => s.kind === "SHOT" && s.attribution !== "penalty-shot",
  );
  const exclusions: Array<{ eventId: number; reason: string }> = [];
  const opportunities: Opportunity[] = [];
  if (issues.includes("invalid-or-duplicate-event-identity/order"))
    return {
      gameId: game.gameId,
      version: "nhl-goalie-opportunity-diagnostic-v1",
      issues,
      opportunities,
      exclusions: eligibleSaves.map((s) => ({
        eventId: s.eventId,
        reason: "ambiguous-event-order",
      })),
      observedVerifiedOrdinarySaves: eligibleSaves.length,
      absorbedContinuationSaves: 0,
      blockedShotActorEvidence,
      interpretation:
        "Unusable event ordering; no guessed sequence or goalie credit.",
    };
  const eventById = new Map(events.map((e) => [e.id, e]));
  const anchorIds = new Set<number>();
  const verificationReason = (
    e: Event | undefined,
    shot: VerifiedShot,
  ): string | null => {
    if (!e) return "missing-official-event";
    if (e.shootout) return "shootout";
    const kind =
      e.kind === "shot-on-goal"
        ? "SHOT"
        : e.kind === "goal"
          ? "GOAL"
          : e.kind === "missed-shot"
            ? "MISS"
            : null;
    if (kind !== shot.kind) return "event-kind-conflict";
    if (e.period === null || e.period <= 0 || e.second === null)
      return "unknown-period-clock";
    if (e.team !== (shot.home ? game.homeTeam : game.awayTeam))
      return "unknown-or-conflicting-team";
    if (
      shot.gameId !== game.gameId ||
      shot.period !== e.period ||
      shot.second !== e.second
    )
      return "verified-event-clock-conflict";
    if (shot.attribution !== "lineup")
      return "active-goalie-not-lineup-verified";
    const goalie = roster.get(shot.goalie);
    if (
      !goalie ||
      goalie.position !== "G" ||
      goalie.seconds <= 0 ||
      goalie.team !== (shot.home ? game.awayTeam : game.homeTeam) ||
      shot.goalie <= 0
    )
      return "no-active-opposing-goalie";
    if (e.goalie !== null && e.goalie !== shot.goalie)
      return "conflicting-goalie";
    if (!e.situation || !/^[01][3-6][3-6][01]$/.test(e.situation))
      return "unknown-official-situation";
    const expected = `${e.situation[2]}v${e.situation[1]}:${e.situation[3] === "1" ? "G" : "E"}${e.situation[0] === "1" ? "G" : "E"}`;
    if (shot.situation !== expected || e.situation[shot.home ? 0 : 3] !== "1")
      return "active-goalie-situation-conflict";
    return null;
  };
  for (const shot of eligibleSaves) {
    const e = eventById.get(shot.eventId);
    const reason = verificationReason(e, shot);
    if (reason) exclusions.push({ eventId: shot.eventId, reason });
    else anchorIds.add(shot.eventId);
  }
  const absorbed = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const initial = events[i]!;
    if (!anchorIds.has(initial.id) || absorbed.has(initial.id)) continue;
    const shot = verified.get(initial.id)!;
    const row: Opportunity = {
      initialEventId: initial.id,
      goalieId: shot.goalie,
      attackingTeam: initial.team!,
      period: initial.period!,
      second: initial.second!,
      attempts: [],
      termination: "source-end-censored",
      terminationEventId: null,
      stoppageReason: null,
      freezeEvidence: "none",
      attributableFreeze: false,
    };
    for (let j = i + 1; j < events.length; j++) {
      const e = events[j]!;
      row.terminationEventId = e.id;
      if (e.period !== initial.period || e.shootout) {
        row.termination = "period-boundary";
        break;
      }
      if (
        e.second === null ||
        e.second < initial.second! ||
        e.second < (events[j - 1]?.second ?? initial.second!)
      ) {
        row.termination = "unknown-or-regressing-clock";
        break;
      }
      const elapsed = e.second - initial.second!;
      if (elapsed > 3) {
        row.termination = "three-second-window-expired";
        row.terminationEventId = null;
        break;
      }
      if (e.kind === "stoppage") {
        row.termination = "observed-stoppage";
        row.stoppageReason = e.reason;
        // Current official feed has reason text but no actor attribution. Even an
        // adjacent goalie-stopped reason is a proxy, never a verified goalie freeze.
        const lastAttempt = row.attempts.at(-1);
        const followsVerifiedSave =
          !lastAttempt ||
          (lastAttempt.kind === "shot-on-goal" && lastAttempt.verified);
        if (
          followsVerifiedSave &&
          (e.reason === "goalie-stopped-after-sog" ||
            e.reason === "goalie-puck-frozen-played-from-beyond-center")
        )
          row.freezeEvidence = "goalie-stoppage-proxy";
        else if (e.reason === "puck-frozen")
          row.freezeEvidence = "puck-frozen-unspecified";
        break;
      }
      if (interruptions.has(e.kind)) {
        row.termination = e.kind;
        break;
      }
      if (e.team !== initial.team) {
        row.termination =
          e.team === game.homeTeam || e.team === game.awayTeam
            ? "opponent-event"
            : "unknown-event-team";
        break;
      }
      if (e.kind === "giveaway") {
        row.termination = "attacking-team-giveaway";
        break;
      }
      if (!attempts.has(e.kind)) {
        // Any intervening action prevents treating a later goalie stoppage as
        // immediately adjacent to a save; retain only explicitly understood play.
        row.termination = "intervening-action";
        break;
      }
      const continuation = verified.get(e.id);
      if (
        (e.goalie !== null && e.goalie !== shot.goalie) ||
        (continuation && continuation.goalie !== shot.goalie)
      ) {
        row.termination = "goalie-change-or-conflict";
        break;
      }
      const continuationVerified =
        continuation !== undefined &&
        verificationReason(e, continuation) === null;
      row.attempts.push({
        eventId: e.id,
        kind: e.kind,
        secondsAfter: elapsed,
        verified: continuationVerified,
        xg:
          continuationVerified && Number.isFinite(continuation.xg)
            ? continuation.xg
            : null,
      });
      if (anchorIds.has(e.id)) absorbed.add(e.id);
      if (e.kind === "goal") {
        row.termination = "goal";
        break;
      }
      row.termination = "source-end-censored";
      row.terminationEventId = null;
    }
    opportunities.push(row);
  }
  return {
    gameId: game.gameId,
    version: "nhl-goalie-opportunity-diagnostic-v1",
    issues,
    opportunities,
    exclusions,
    observedVerifiedOrdinarySaves: eligibleSaves.length,
    absorbedContinuationSaves: absorbed.size,
    blockedShotActorEvidence,
    interpretation:
      "Exclusive three-second chains from verified active-goalie saves. Continuations include misses/blocks without goalie-action attribution. Stoppage reasons are proxies; absence of an event is censored, not a freeze. No fitted or causal credit.",
  };
}

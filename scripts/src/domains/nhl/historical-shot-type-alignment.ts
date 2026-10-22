/** Complete three-source identity matching only; never resolves ambiguous IDs by order. */
export type Native = {
  eventId: number;
  sortOrder: number;
  typeDescKey: string;
  periodDescriptor: { number: number; periodType: string };
  timeInPeriod: string;
  details?: Record<string, unknown>;
};
export type Primary = {
  ordinal: number;
  period: number;
  second: number;
  kind: string;
  team: number;
  shooter: number;
  goalie: number;
  shotType: string;
};
export type RawShot = {
  ordinal: number;
  period: number;
  second: number;
  kind: string;
  shooter: number;
  goalie: number;
  home: boolean;
  shotType: string;
};
const sourceTypeAliases: Record<string, string> = {
  back: "backhand",
  tip: "tip-in",
  defl: "deflected",
  wrap: "wrap-around",
};
const normalizedType = (v: unknown) =>
  sourceTypeAliases[String(v).toLowerCase()] ?? String(v).toLowerCase();
const known = new Set([
  "backhand",
  "wrist",
  "snap",
  "slap",
  "tip-in",
  "deflected",
  "wrap-around",
]);
export function alignHistoricalShotTypes(
  native: readonly Native[],
  primary: readonly Primary[],
  provider: readonly RawShot[],
  homeTeamId: number,
) {
  const reject = (reason: string) => ({
    status: "unavailable" as const,
    reason,
    matches: [] as Array<{ eventId: number; ordinal: number }>,
  });
  if (
    native.length < 2 ||
    native.length > 6 ||
    native.length !== primary.length ||
    native.length !== provider.length
  )
    return reject("Incomplete same-clock physical group");
  if (
    new Set(native.map((p) => p.eventId)).size !== native.length ||
    new Set(primary.map((p) => p.ordinal)).size !== primary.length ||
    new Set(provider.map((p) => p.ordinal)).size !== provider.length
  )
    return reject("Duplicate physical identity");
  const n = native[0]!,
    m = n.timeInPeriod.match(/^(\d+):(\d{2})$/);
  if (!m || Number(m[2]) >= 60) return reject("Invalid native clock");
  const second = Number(m[1]) * 60 + Number(m[2]);
  if (
    !Number.isSafeInteger(homeTeamId) ||
    homeTeamId <= 0 ||
    !Number.isSafeInteger(n.periodDescriptor.number) ||
    n.periodDescriptor.number < 1 ||
    n.periodDescriptor.number > 4 ||
    second > (n.periodDescriptor.number === 4 ? 300 : 1200) ||
    !Number.isSafeInteger(n.details?.eventOwnerTeamId) ||
    Number(n.details?.eventOwnerTeamId) <= 0 ||
    !Number.isSafeInteger(n.details?.shootingPlayerId) ||
    Number(n.details?.shootingPlayerId) <= 0 ||
    !Number.isSafeInteger(n.details?.goalieInNetId) ||
    Number(n.details?.goalieInNetId) < 0
  )
    return reject("Incomplete native role identity");
  for (const p of native) {
    if (
      !Number.isSafeInteger(p.eventId) ||
      p.eventId <= 0 ||
      !Number.isSafeInteger(p.sortOrder) ||
      p.periodDescriptor.periodType === "SO" ||
      p.typeDescKey !== "shot-on-goal" ||
      p.periodDescriptor.number !== n.periodDescriptor.number ||
      p.timeInPeriod !== n.timeInPeriod ||
      p.details?.eventOwnerTeamId !== n.details?.eventOwnerTeamId ||
      p.details?.shootingPlayerId !== n.details?.shootingPlayerId ||
      p.details?.goalieInNetId !== n.details?.goalieInNetId ||
      !known.has(normalizedType(p.details?.shotType))
    )
      return reject("Mixed or unknown native physical facts");
  }
  for (const p of primary) {
    const rows = provider.filter((v) => v.ordinal === p.ordinal);
    if (
      !Number.isSafeInteger(p.ordinal) ||
      p.ordinal <= 0 ||
      p.kind !== "shot-on-goal" ||
      p.period !== n.periodDescriptor.number ||
      p.second !== second ||
      p.team !== n.details?.eventOwnerTeamId ||
      p.shooter !== n.details?.shootingPlayerId ||
      p.goalie !== n.details?.goalieInNetId ||
      !known.has(normalizedType(p.shotType)) ||
      rows.length !== 1
    )
      return reject("Primary physical group differs");
    const v = rows[0]!;
    if (
      v.kind !== "SHOT" ||
      v.period !== p.period ||
      v.second !== p.second ||
      v.shooter !== p.shooter ||
      v.goalie !== p.goalie ||
      v.home !== (p.team === homeTeamId) ||
      normalizedType(v.shotType) !== normalizedType(p.shotType)
    )
      return reject("Raw archive and primary type/identity differ");
  }
  const edges = primary.map((p) =>
    native
      .map((v, i) =>
        normalizedType(v.details?.shotType) === normalizedType(p.shotType)
          ? i
          : -1,
      )
      .filter((i) => i >= 0),
  );
  const solutions: number[][] = [];
  function search(k: number, used: Set<number>, current: number[]) {
    if (solutions.length > 1) return;
    if (k === edges.length) {
      solutions.push([...current]);
      return;
    }
    for (const i of edges[k]!) {
      if (used.has(i)) continue;
      used.add(i);
      current.push(i);
      search(k + 1, used, current);
      current.pop();
      used.delete(i);
    }
  }
  search(0, new Set(), []);
  if (solutions.length === 0)
    return reject("No complete three-source type bijection");
  if (solutions.length !== 1)
    return {
      status: "ambiguous" as const,
      matches: [],
      reason:
        "Multiple complete type bijections; native identity remains unresolved",
    };
  return {
    status: "unique" as const,
    matches: primary.map((p, i) => ({
      ordinal: p.ordinal,
      eventId: native[solutions[0]![i]!]!.eventId,
    })),
    evidence: primary.map((p, i) => ({
      ordinal: p.ordinal,
      nativeEventId: native[solutions[0]![i]!]!.eventId,
      nativeShotType: String(native[solutions[0]![i]!]!.details?.shotType),
      primaryShotType: p.shotType,
      archiveShotType: provider.find((v) => v.ordinal === p.ordinal)!.shotType,
    })),
    interpretation:
      "Unique complete type/actor/clock/team/goalie bijection only. No payload, geometry, label, or probability is changed.",
  };
}

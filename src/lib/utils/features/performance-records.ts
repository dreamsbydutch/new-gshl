import type {
  PerformanceRecordBadge,
  RecordObservation,
} from "../../types/performance-records";

const DAY = 86_400_000;
export function recordWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  now: number,
): boolean {
  if (!start || !end) return false;
  const first = Date.parse(start);
  const last = Date.parse(end);
  const today = Date.parse(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
  );
  return (
    Number.isFinite(first) &&
    Number.isFinite(last) &&
    last >= first &&
    today >= first &&
    today >= last - DAY
  );
}
export function recordNumber(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    value === "" ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
// Counting stats only: rate records need separate goalie qualification rules.
export const RECORD_STATS = [
  "G",
  "A",
  "P",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "SV",
  "SO",
] as const;
export function buildPerformanceRecords(
  current: RecordObservation[],
  history: RecordObservation[],
  provisional: boolean,
): PerformanceRecordBadge[] {
  const badges: PerformanceRecordBadge[] = [];
  for (const row of current) {
    if ((recordNumber(row.stats.GP) ?? 0) <= 0) continue;
    for (const stat of RECORD_STATS) {
      const value = recordNumber(row.stats[stat]);
      if (value === null) continue;
      const goalie = ["W", "SV", "SO"].includes(stat);
      if (goalie && (recordNumber(row.stats.GS) ?? 0) < 3) continue;
      if (
        row.kind === "player" &&
        (value <= 0 || (recordNumber(row.stats.GP) ?? 0) < 2)
      )
        continue;
      const peers = history.filter(
        (peer) =>
          peer.kind === row.kind &&
          peer.id !== row.id &&
          (recordNumber(peer.stats.GP) ?? 0) > 0 &&
          (!goalie || (recordNumber(peer.stats.GS) ?? 0) >= 3) &&
          (row.kind !== "player" || (recordNumber(peer.stats.GP) ?? 0) >= 2) &&
          recordNumber(peer.stats[stat]) !== null,
      );
      if (!peers.length) continue;
      const values = peers.map((peer) => recordNumber(peer.stats[stat])!);
      const minimum = values.reduce(
        (best, value) => Math.min(best, value),
        Infinity,
      );
      const maximum = values.reduce(
        (best, value) => Math.max(best, value),
        -Infinity,
      );
      for (const direction of row.kind === "team"
        ? (["low", "high"] as const)
        : (["high"] as const)) {
        if (direction === "low" && ["SO", "W"].includes(stat)) continue;
        const previous = direction === "low" ? minimum : maximum;
        if (minimum === maximum) continue;
        if (direction === "low" ? value > previous : value < previous) continue;
        const matches = peers.filter(
          (peer) => recordNumber(peer.stats[stat]) === previous,
        );
        badges.push({
          entityId: row.entityId,
          stat,
          direction,
          tied: value === previous,
          provisional,
          value,
          previous,
          compared: peers.length,
          ties: value === previous ? matches.length : 0,
          examples: matches.slice(0, 5).map((peer) => ({
            entityId:
              peer.kind === "player" && typeof peer.stats.playerId === "string"
                ? peer.stats.playerId
                : peer.entityId,
            kind: peer.kind,
            label: peer.label,
            matchupId: peer.matchupId,
          })),
        });
      }
    }
  }
  return badges;
}

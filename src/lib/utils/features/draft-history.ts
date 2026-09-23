import type {
  DraftHistoryPick,
  DraftPerformance,
  DraftResultInput,
  SigningValue,
} from "../../types/draft-history";
import { expectedDraftRating } from "./draft-slot-curve";

export function draftSeasonWindow(input: {
  start: string | null;
  end: string | null;
  weeks: { start: string | null; end: string | null; type: string }[];
}) {
  const weeks = input.weeks.filter(
    (week) =>
      ["RS", "PO", "LT"].includes(week.type) &&
      week.start &&
      week.end &&
      week.end >= week.start,
  );
  const starts = weeks.map((week) => week.start!).sort();
  const ends = weeks.map((week) => week.end!).sort();
  // Season metadata can extend to Sunday after the last NHL playing day.
  // Use the scheduled competition window, never the longest individual tenure.
  const start = starts[0] ?? input.start;
  const end = ends.at(-1) ?? input.end;
  const days =
    start && end && end >= start
      ? Math.round(
          (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
            86_400_000,
        ) + 1
      : null;
  return { start, end, days };
}

export function draftNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A retrospective slot benchmark, separate from the official Calder formula. */
export function buildDraftHistoryPicks(input: {
  picks: DraftResultInput[];
  teamIds: string[];
  totals: DraftPerformance[];
  splits: DraftPerformance[];
  postseasonTotals?: DraftPerformance[];
  postseasonSplits?: DraftPerformance[];
  players: { id: string; name: string; position: string }[];
  outcomes?: Map<string, DraftHistoryPick["outcome"]>;
  seasonDays?: number | null;
  signingValues?: Map<string, SigningValue>;
}): DraftHistoryPick[] {
  const percentage = (days: number | null) =>
    days !== null && input.seasonDays && input.seasonDays > 0
      ? (days / input.seasonDays) * 100
      : null;
  const totals = new Map(input.totals.map((row) => [row.playerId, row]));
  const splits = new Map(
    input.splits.map((row) => [`${row.teamId}:${row.playerId}`, row]),
  );
  const players = new Map(input.players.map((row) => [row.id, row]));
  const postseasonTotals = new Map(
    (input.postseasonTotals ?? []).map((row) => [row.playerId, row]),
  );
  const postseasonSplits = new Map(
    (input.postseasonSplits ?? []).map((row) => [
      `${row.teamId}:${row.playerId}`,
      row,
    ]),
  );
  const rosterDays = (...rows: (DraftPerformance | undefined)[]) => {
    const counts = rows
      .map((row) => draftNumber(row?.days))
      .filter((days): days is number => days !== null);
    return counts.length ? counts.reduce((sum, days) => sum + days, 0) : null;
  };
  const pool = input.picks.filter(
    (pick) =>
      !pick.isSigning &&
      Number.isInteger(draftNumber(pick.pick)) &&
      (draftNumber(pick.pick) ?? 0) > 0,
  );
  const maxPick = Math.max(0, ...pool.map((pick) => Number(pick.pick)));
  return input.picks
    .filter((pick) => input.teamIds.includes(pick.teamId ?? ""))
    .map((pick) => {
      const total = totals.get(pick.playerId ?? "");
      const split = splits.get(`${pick.teamId}:${pick.playerId}`);
      const player = players.get(pick.playerId ?? "");
      const slot = draftNumber(pick.pick);
      const overallRating = draftNumber(total?.rating);
      const signingValue = pick.isSigning
        ? input.signingValues?.get(pick.id)
        : undefined;
      const days = rosterDays(
        split,
        postseasonSplits.get(`${pick.teamId}:${pick.playerId}`),
      );
      const usageDays = rosterDays(
        total,
        postseasonTotals.get(pick.playerId ?? ""),
      );
      const expectedRating =
        !pick.isSigning && slot !== null && slot > 0
          ? expectedDraftRating(slot, maxPick)
          : null;
      return {
        id: pick.id,
        playerId: pick.playerId ?? null,
        name: pick.playerId
          ? (player?.name ?? "Unknown player")
          : "Unselected pick",
        position: split?.position ?? total?.position ?? player?.position ?? "—",
        pick: slot,
        round: pick.round,
        signing: pick.isSigning,
        salary: signingValue?.salary ?? null,
        salaryExpectedRating: signingValue?.expectedRating ?? null,
        signingValue: signingValue?.value ?? null,
        teamRating: draftNumber(split?.rating),
        overallRating,
        days,
        usageDays,
        teamDaysPercent: percentage(days),
        usagePercent: percentage(usageDays),
        outcome: input.outcomes?.get(pick.id) ?? {
          label: "Roster history unavailable",
          date: null,
        },
        expectedRating,
        surplus:
          overallRating !== null && expectedRating !== null
            ? overallRating - expectedRating
            : null,
      };
    })
    .sort(
      (a, b) =>
        Number(a.signing) - Number(b.signing) ||
        (a.pick ?? Infinity) - (b.pick ?? Infinity),
    );
}

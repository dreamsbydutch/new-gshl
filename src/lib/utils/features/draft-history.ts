import type {
  DraftHistoryPick,
  DraftPerformance,
  DraftResultInput,
} from "../../types/draft-history";

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
  players: { id: string; name: string; position: string }[];
  outcomes?: Map<string, DraftHistoryPick["outcome"]>;
}): DraftHistoryPick[] {
  const totals = new Map(input.totals.map((row) => [row.playerId, row]));
  const splits = new Map(
    input.splits.map((row) => [`${row.teamId}:${row.playerId}`, row]),
  );
  const players = new Map(input.players.map((row) => [row.id, row]));
  const pool = input.picks.filter(
    (pick) => !pick.isSigning && (draftNumber(pick.pick) ?? 0) > 0,
  );
  const maxPick = Math.max(0, ...pool.map((pick) => Number(pick.pick)));
  const ratings = pool.flatMap((pick) => {
    const value = draftNumber(totals.get(pick.playerId ?? "")?.rating);
    return value === null ? [] : [value];
  });
  // Do not infer outcomes from missing archives or a single rated selection.
  const low = ratings.length >= 2 ? Math.min(...ratings) : null;
  const high = ratings.length >= 2 ? Math.max(...ratings) : null;
  return input.picks
    .filter((pick) => input.teamIds.includes(pick.teamId ?? ""))
    .map((pick) => {
      const total = totals.get(pick.playerId ?? "");
      const split = splits.get(`${pick.teamId}:${pick.playerId}`);
      const player = players.get(pick.playerId ?? "");
      const slot = draftNumber(pick.pick);
      const overallRating = draftNumber(total?.rating);
      const expectedRating =
        !pick.isSigning &&
        slot !== null &&
        slot > 0 &&
        low !== null &&
        high !== null
          ? low + (high - low) * Math.pow((maxPick - slot + 1) / maxPick, 1.35)
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
        teamRating: draftNumber(split?.rating),
        overallRating,
        days: draftNumber(split?.days),
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

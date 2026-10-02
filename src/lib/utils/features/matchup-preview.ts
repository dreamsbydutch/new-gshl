import type {
  MatchupDetailsMatchup,
  MatchupDetailsWeek,
  Player,
} from "@gshl-types";
import { normalizeDateOnlyValue } from "../core/date";
import { isMatchupDetailsComplete } from "./matchup-details";

export function isMatchupUpcoming(
  matchup: Partial<MatchupDetailsMatchup> | null,
  week: Pick<MatchupDetailsWeek, "startDate"> | null,
  scheduleDate: string | undefined,
) {
  const start = normalizeDateOnlyValue(week?.startDate);
  return Boolean(
    matchup &&
      !isMatchupDetailsComplete(matchup, null) &&
      start &&
      scheduleDate &&
      scheduleDate < start,
  );
}

type WatchPlayer = Pick<Player, "id" | "fullName" | "posGroup" | "overallRk">;

/** Select from existing published ranks; never substitute unplayed week stats. */
export function selectPlayersToWatch<T extends WatchPlayer>(
  players: readonly T[],
) {
  const ranked = [...players]
    .filter(
      (player) =>
        Number.isFinite(player.overallRk) && Number(player.overallRk) > 0,
    )
    .sort(
      (a, b) =>
        Number(a.overallRk) - Number(b.overallRk) ||
        a.fullName.localeCompare(b.fullName),
    );
  return [
    ...new Map(ranked.map((player) => [player.id, player])).values(),
  ].slice(0, 3);
}

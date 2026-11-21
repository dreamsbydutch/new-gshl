import type { DraftHubStatus } from "@gshl-types";

export const HOME_LEAGUE_ACTIVITY_PREVIEW_LIMIT = 5;
export const HOME_LEAGUE_ACTIVITY_QUERY_LIMIT = 12;
export const HOME_MOCK_DRAFT_PREVIEW_LIMIT = 4;
export const HOME_POWER_RANKINGS_LIMIT = 8;
export const HOME_UFA_PREVIEW_LIMIT = 5;

/** Promote the draft for one week before its start and three days afterward. */
export function isHomeDraftHubVisible(
  draftStartAt: string | null | undefined,
  now: Date,
  status?: DraftHubStatus,
): boolean {
  const startsAt = draftStartAt ? Date.parse(draftStartAt) : Number.NaN;
  const currentTime = now.getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(currentTime)) return false;
  if (status === "on_clock" || status === "commissioner_required") return true;
  const day = 24 * 60 * 60 * 1000;
  return currentTime >= startsAt - 7 * day && currentTime < startsAt + 3 * day;
}

/** Returns the compact activity inventory until the reader expands it. */
export function selectHomeLeagueActivity<T>(
  entries: readonly T[],
  expanded: boolean,
): T[] {
  return expanded
    ? [...entries]
    : entries.slice(0, HOME_LEAGUE_ACTIVITY_PREVIEW_LIMIT);
}

/** Keeps the first few first-round projections as a representative preview. */
export function selectHomeMockDraftPreview<
  T extends { pick: { round: string } },
>(entries: readonly T[]): T[] {
  return entries
    .filter((entry) => Number(entry.pick.round) === 1)
    .slice(0, HOME_MOCK_DRAFT_PREVIEW_LIMIT);
}

/** Returns a compact, immutable preview while preserving ranking order. */
export function selectHomePowerRankingPreview<T>(entries: readonly T[]): T[] {
  return entries.slice(0, HOME_POWER_RANKINGS_LIMIT);
}

/** Limits Home to a decision-ready sample; League Office owns the full pool. */
export function selectHomeUfaPreview<T>(entries: readonly T[]): T[] {
  return entries.slice(0, HOME_UFA_PREVIEW_LIMIT);
}

import type { LeagueActivityEvent } from "../../types/league-activity";
import { groupLeagueActivity } from "./league-activity";

export function prioritizeHomeActivity(
  events: readonly LeagueActivityEvent[],
  teamId?: string,
  opponentId?: string,
  contenderIds: readonly string[] = [],
) {
  const involved = (event: LeagueActivityEvent, id: string | undefined) =>
    Boolean(
      id &&
        (event.teamId === id ||
          event.trade?.teamA.id === id ||
          event.trade?.teamB.id === id),
    );
  const priority = (event: LeagueActivityEvent) =>
    involved(event, teamId)
      ? 0
      : involved(event, opponentId)
        ? 1
        : contenderIds.some((id) => involved(event, id))
          ? 2
          : 3;
  const sorted = [...events].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      b.date.localeCompare(a.date) ||
      a.id.localeCompare(b.id),
  );
  return groupLeagueActivity(sorted);
}

/** Keep games with incomplete ratings in schedule order after rated games. */
export function orderHomeMatchups<
  T extends { homeTeamId: string; awayTeamId: string },
>(
  matchups: readonly T[],
  entries: readonly { team: { id: string }; rating: number | null }[],
  ownerTeamId?: string,
) {
  const ratings = new Map(entries.map(({ team, rating }) => [team.id, rating]));
  return matchups
    .map((matchup) => {
      const home = ratings.get(matchup.homeTeamId);
      const away = ratings.get(matchup.awayTeamId);
      return {
        matchup,
        isOwn:
          matchup.homeTeamId === ownerTeamId ||
          matchup.awayTeamId === ownerTeamId,
        combined: home != null && away != null ? home + away : -Infinity,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isOwn) - Number(a.isOwn) ||
        (a.combined === b.combined ? 0 : b.combined - a.combined),
    );
}

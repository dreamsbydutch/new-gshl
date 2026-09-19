import type {
  DraftClockState,
  DraftHubDraftPick,
  DraftHubEligiblePlayerView,
  DraftHubNextPickNotice,
  DraftHubPickView,
  DraftHubStatus,
  DraftPlayerSortDirection,
  DraftPlayerSortKey,
  DraftPick,
  Season,
} from "@gshl-types";
import { findCurrentSeason, findUpcomingSeason } from "../domain/season";

export const DRAFT_PICK_CLOCK_MS = 4 * 60 * 1000;
export const ESTIMATED_DRAFT_PICK_MS = 82 * 1000;

const DRAFT_RANK_SORT_KEYS = new Set<DraftPlayerSortKey>([
  "draftRk",
  "overallRk",
  "yahooDraftRk",
  "dailyFaceoffRk",
  "nhlRk",
]);

const DRAFT_RANKING_SOURCES = [
  { key: "overallRk", weight: 0.15 },
  { key: "yahooDraftRk", weight: 0.3 },
  { key: "dailyFaceoffRk", weight: 0.3 },
  { key: "nhlRk", weight: 0.25 },
] as const;

type DraftRankingSourceKey = (typeof DRAFT_RANKING_SOURCES)[number]["key"];

function getRankValue(
  player: DraftHubEligiblePlayerView,
  key: DraftRankingSourceKey,
): number | null {
  const value = Number(player[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Produces a composite draft rank that emphasizes projection sources over the
 * league's current-performance rank. Source ranks are normalized individually
 * so rankings with different list depths remain comparable. An absent source
 * rank is treated as one place below that source's displayed list.
 */
export function getDraftCompositeRanks(
  players: readonly DraftHubEligiblePlayerView[],
): ReadonlyMap<string, number> {
  const sourceMaximums = new Map<DraftRankingSourceKey, number>(
    DRAFT_RANKING_SOURCES.map(({ key }) => [
      key,
      Math.max(
        1,
        ...players.flatMap((player) => {
          const rank = getRankValue(player, key);
          return rank === null ? [] : [rank];
        }),
      ),
    ]),
  );
  const scoredPlayers = players
    .map((player) => {
      const score = DRAFT_RANKING_SOURCES.reduce((total, { key, weight }) => {
        const maximum = sourceMaximums.get(key) ?? 1;
        const rank = getRankValue(player, key) ?? maximum + 1;
        return total + ((Math.min(rank, maximum + 1) - 1) / maximum) * weight;
      }, 0);
      return { player, score };
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        Number(left.player.overallRk ?? Number.MAX_SAFE_INTEGER) -
          Number(right.player.overallRk ?? Number.MAX_SAFE_INTEGER) ||
        left.player.fullName.localeCompare(right.player.fullName),
    );

  return new Map(
    scoredPlayers.map(({ player }, index) => [String(player.id), index + 1]),
  );
}

const DRAFT_TEXT_SORT_KEYS = new Set<DraftPlayerSortKey>([
  "nhlTeam",
  "fullName",
  "nhlPosition",
]);

export function getDefaultDraftPlayerSortDirection(
  key: DraftPlayerSortKey,
): DraftPlayerSortDirection {
  return DRAFT_RANK_SORT_KEYS.has(key) || DRAFT_TEXT_SORT_KEYS.has(key)
    ? "asc"
    : "desc";
}

function getDraftPlayerSortValue(
  player: DraftHubEligiblePlayerView,
  key: DraftPlayerSortKey,
): number | string | null {
  if (key === "nhlTeam") return player.nhlTeam;
  if (key === "fullName") return player.fullName;
  if (key === "nhlPosition") {
    return player.nhlPos.length > 0 ? player.nhlPos.join("/") : player.posGroup;
  }
  if (key === "draftRk") return null;

  const rawValue =
    key === "overallRk" ||
    key === "yahooDraftRk" ||
    key === "dailyFaceoffRk" ||
    key === "nhlRk" ||
    key === "overallRating"
      ? player[key]
      : player.stats?.[key];
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function compareDraftPlayerSortValues(
  left: number | string | null,
  right: number | string | null,
  direction: DraftPlayerSortDirection,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const comparison =
    typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(left) - Number(right);
  return direction === "asc" ? comparison : -comparison;
}

export function sortDraftEligiblePlayers(
  players: readonly DraftHubEligiblePlayerView[],
  key: DraftPlayerSortKey,
  direction: DraftPlayerSortDirection,
): DraftHubEligiblePlayerView[] {
  const compositeRanks =
    key === "draftRk" ? getDraftCompositeRanks(players) : null;
  return [...players].sort((left, right) => {
    const primary = compareDraftPlayerSortValues(
      key === "draftRk"
        ? (compositeRanks?.get(String(left.id)) ?? null)
        : getDraftPlayerSortValue(left, key),
      key === "draftRk"
        ? (compositeRanks?.get(String(right.id)) ?? null)
        : getDraftPlayerSortValue(right, key),
      direction,
    );
    if (primary !== 0) return primary;

    const rank =
      Number(left.overallRk ?? Number.MAX_SAFE_INTEGER) -
      Number(right.overallRk ?? Number.MAX_SAFE_INTEGER);
    return rank || left.fullName.localeCompare(right.fullName);
  });
}

export function getNextOwnerDraftPickNotice(
  picks: readonly DraftHubPickView[],
  ownerId: string | null | undefined,
  estimateBaseTime: number,
): DraftHubNextPickNotice | null {
  if (!ownerId) return null;

  const openPicks = [...picks]
    .filter((pick) => !pick.pick.isSigning && !pick.pick.playerId)
    .sort((left, right) => compareDraftPickOrder(left.pick, right.pick));
  const nextPickIndex = openPicks.findIndex(
    (pick) => String(pick.team?.ownerId ?? "") === String(ownerId),
  );
  if (nextPickIndex < 0) return null;

  const pick = openPicks[nextPickIndex];
  if (!pick) return null;
  return {
    pick,
    picksAway: nextPickIndex,
    estimatedAt: estimateBaseTime + nextPickIndex * ESTIMATED_DRAFT_PICK_MS,
  };
}

export function getDraftYear(
  season: Pick<Season, "draftStartAt" | "startDate" | "year">,
): number {
  const draftDate = season.draftStartAt
    ? new Date(season.draftStartAt)
    : new Date(season.startDate);
  const dateYear = draftDate.getUTCFullYear();
  if (Number.isFinite(dateYear)) return dateYear;

  const seasonYear = Number(season.year);
  return Number.isFinite(seasonYear)
    ? seasonYear - 1
    : new Date().getFullYear();
}

function timestamp(
  value: Date | string | number | null | undefined,
): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  const valueOf = parsed.getTime();
  return Number.isNaN(valueOf) ? null : valueOf;
}

export function draftPickHasPlayer(pick: Pick<DraftPick, "playerId">): boolean {
  return typeof pick.playerId === "string" && pick.playerId.trim().length > 0;
}

export function isLiveDraftSelection(
  pick: Pick<DraftPick, "isSigning">,
): boolean {
  return !pick.isSigning;
}

export function compareDraftPickOrder(
  left: Pick<DraftPick, "round" | "pick">,
  right: Pick<DraftPick, "round" | "pick">,
): number {
  return (
    Number(left.round ?? 0) - Number(right.round ?? 0) ||
    Number(left.pick ?? 0) - Number(right.pick ?? 0)
  );
}

export function orderDraftPicks<T extends Pick<DraftPick, "round" | "pick">>(
  picks: readonly T[],
): T[] {
  return [...picks].sort(compareDraftPickOrder);
}

export function findLatestCompletedLiveDraftPick<
  T extends Pick<DraftPick, "round" | "pick" | "playerId" | "isSigning">,
>(picks: readonly T[]): T | null {
  const completedPicks = orderDraftPicks(picks).filter(
    (pick) => isLiveDraftSelection(pick) && draftPickHasPlayer(pick),
  );
  return completedPicks.at(-1) ?? null;
}

export function serializeDraftHubPick(pick: DraftPick): DraftHubDraftPick {
  return {
    ...pick,
    onClockStartedAt: timestamp(pick.onClockStartedAt),
    onClockExpiresAt: timestamp(pick.onClockExpiresAt),
    onClockEndedAt: timestamp(pick.onClockEndedAt),
    createdAt: pick.createdAt.getTime(),
    updatedAt: pick.updatedAt.getTime(),
  };
}

function effectiveClockStart(
  orderedPicks: DraftPick[],
  activeIndex: number,
  draftStartAt: Date | string | number,
): number | null {
  const activePick = orderedPicks[activeIndex];
  const storedStart = timestamp(activePick?.onClockStartedAt);
  if (storedStart !== null) return storedStart;

  if (activeIndex === 0) return timestamp(draftStartAt);

  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const previousPick = orderedPicks[index];
    if (!previousPick || !draftPickHasPlayer(previousPick)) continue;
    const previousEnd =
      timestamp(previousPick.onClockEndedAt) ??
      timestamp(previousPick.updatedAt);
    if (previousEnd !== null) return previousEnd;
  }

  return timestamp(draftStartAt);
}

export function resolveDraftClockState(
  picks: readonly DraftPick[],
  draftStartAt: Date | string | number | null | undefined,
  now: Date = new Date(),
  pickLimit = 5,
): DraftClockState {
  const orderedPicks = orderDraftPicks(picks);
  const liveDraftPicks = orderedPicks.filter(isLiveDraftSelection);
  const completedPicks = liveDraftPicks.filter(draftPickHasPlayer);
  const activeIndex = liveDraftPicks.findIndex(
    (pick) => !draftPickHasPlayer(pick),
  );
  const activePick =
    activeIndex >= 0 ? (liveDraftPicks[activeIndex] ?? null) : null;
  const recentPicks = [...completedPicks].reverse().slice(0, pickLimit);

  if (orderedPicks.length === 0 || !draftStartAt) {
    return {
      status: "unavailable",
      activePick,
      completedCount: completedPicks.length,
      remainingCount: liveDraftPicks.length - completedPicks.length,
      clockStartedAt: null,
      clockExpiresAt: null,
      recentPicks: [],
      upcomingPicks: [],
    };
  }

  const draftStart = timestamp(draftStartAt);
  const nowTime = now.getTime();

  if (!activePick) {
    if (draftStart !== null && nowTime < draftStart) {
      return {
        status: "upcoming",
        activePick: null,
        completedCount: completedPicks.length,
        remainingCount: 0,
        clockStartedAt: null,
        clockExpiresAt: null,
        recentPicks: [],
        upcomingPicks: [],
      };
    }

    return {
      status: "complete",
      activePick: null,
      completedCount: completedPicks.length,
      remainingCount: 0,
      clockStartedAt: null,
      clockExpiresAt: null,
      recentPicks,
      upcomingPicks: [],
    };
  }

  const startedAt = effectiveClockStart(
    liveDraftPicks,
    activeIndex,
    draftStartAt,
  );
  const storedExpiry = timestamp(activePick.onClockExpiresAt);
  const expiresAt =
    storedExpiry ??
    (startedAt === null ? null : startedAt + DRAFT_PICK_CLOCK_MS);
  let status: DraftHubStatus = "unavailable";

  if (draftStart !== null && nowTime < draftStart) {
    status = "upcoming";
  } else if (expiresAt !== null && nowTime >= expiresAt) {
    status = "commissioner_required";
  } else if (startedAt !== null) {
    status = "on_clock";
  }

  return {
    status,
    activePick,
    completedCount: completedPicks.length,
    remainingCount: liveDraftPicks.length - completedPicks.length,
    clockStartedAt: startedAt,
    clockExpiresAt: expiresAt,
    recentPicks: status === "upcoming" ? [] : recentPicks,
    upcomingPicks: liveDraftPicks
      .slice(activeIndex + 1)
      .filter((pick) => !draftPickHasPlayer(pick))
      .slice(0, pickLimit),
  };
}

export function canSubmitDraftPick(options: {
  role: "viewer" | "owner" | "commissioner" | undefined;
  userOwnerId?: string | null;
  activeTeamOwnerId?: string | null;
  status: DraftHubStatus;
}): boolean {
  const { role, userOwnerId, activeTeamOwnerId, status } = options;
  if (status !== "on_clock" && status !== "commissioner_required") return false;
  if (role === "commissioner") return true;
  return (
    status === "on_clock" &&
    role === "owner" &&
    Boolean(userOwnerId) &&
    String(userOwnerId) === String(activeTeamOwnerId)
  );
}

export function resolveDraftHubSeason(
  seasons: readonly Season[],
  referenceDate: Date = new Date(),
): Season | undefined {
  const realSeasons = [...seasons];
  const currentSeason = findCurrentSeason(realSeasons, referenceDate);
  if (currentSeason?.draftStartAt) return currentSeason;

  const upcomingSeason = findUpcomingSeason(realSeasons, referenceDate);
  return upcomingSeason?.draftStartAt ? upcomingSeason : undefined;
}

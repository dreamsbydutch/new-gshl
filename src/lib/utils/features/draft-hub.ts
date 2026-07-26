import type {
  DraftClockState,
  DraftHubDraftPick,
  DraftHubPickView,
  DraftHubStatus,
  DraftPick,
  Season,
} from "@gshl-types";
import {
  findOffseasonWindow,
  resolveContractDefaultSeason,
} from "../domain/season";

export const DRAFT_PICK_CLOCK_MS = 4 * 60 * 1000;

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
): DraftClockState {
  const orderedPicks = orderDraftPicks(picks);
  const completedPicks = orderedPicks.filter(draftPickHasPlayer);
  const activeIndex = orderedPicks.findIndex(
    (pick) => !draftPickHasPlayer(pick),
  );
  const activePick =
    activeIndex >= 0 ? (orderedPicks[activeIndex] ?? null) : null;
  const recentPicks = [...completedPicks].reverse().slice(0, 5);

  if (orderedPicks.length === 0 || !draftStartAt) {
    return {
      status: "unavailable",
      activePick,
      completedCount: completedPicks.length,
      remainingCount: orderedPicks.length - completedPicks.length,
      clockStartedAt: null,
      clockExpiresAt: null,
      recentPicks,
      upcomingPicks: [],
    };
  }

  if (!activePick) {
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

  const draftStart = timestamp(draftStartAt);
  const startedAt = effectiveClockStart(
    orderedPicks,
    activeIndex,
    draftStartAt,
  );
  const storedExpiry = timestamp(activePick.onClockExpiresAt);
  const expiresAt =
    storedExpiry ??
    (startedAt === null ? null : startedAt + DRAFT_PICK_CLOCK_MS);
  const nowTime = now.getTime();
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
    remainingCount: orderedPicks.length - completedPicks.length,
    clockStartedAt: startedAt,
    clockExpiresAt: expiresAt,
    recentPicks,
    upcomingPicks: orderedPicks
      .slice(activeIndex + 1)
      .filter((pick) => !draftPickHasPlayer(pick))
      .slice(0, 5),
  };
}

export function groupDraftHubPicks(
  picks: readonly DraftHubPickView[],
): Array<{ round: string; picks: DraftHubPickView[] }> {
  const grouped = new Map<string, DraftHubPickView[]>();
  for (const pickView of [...picks].sort((left, right) =>
    compareDraftPickOrder(left.pick, right.pick),
  )) {
    const round = String(pickView.pick.round);
    grouped.set(round, [...(grouped.get(round) ?? []), pickView]);
  }
  return [...grouped.entries()].map(([round, roundPicks]) => ({
    round,
    picks: roundPicks,
  }));
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
  const offseasonSeason = findOffseasonWindow(
    [...seasons],
    referenceDate,
  )?.upcomingSeason;
  if (offseasonSeason?.draftStartAt) return offseasonSeason;

  const contractSeason = resolveContractDefaultSeason(
    [...seasons],
    referenceDate,
  );
  if (contractSeason?.draftStartAt) return contractSeason;

  return [...seasons]
    .filter((season) => {
      const draftTime = season.draftStartAt
        ? new Date(season.draftStartAt).getTime()
        : Number.NaN;
      return !Number.isNaN(draftTime);
    })
    .sort((left, right) => {
      const leftDistance = Math.abs(
        new Date(left.draftStartAt ?? 0).getTime() - referenceDate.getTime(),
      );
      const rightDistance = Math.abs(
        new Date(right.draftStartAt ?? 0).getTime() - referenceDate.getTime(),
      );
      return leftDistance - rightDistance;
    })[0];
}

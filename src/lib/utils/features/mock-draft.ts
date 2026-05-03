import { type DraftPick, type GSHLTeam } from "@gshl-types";
import type { DraftBoardPlayer } from "@gshl-types";

export interface ProjectedDraftPick<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
> {
  pick: DraftPick;
  gshlTeam?: GSHLTeam;
  projectedPlayer?: TPlayer;
  score: number | null;
}

export interface BuildMockDraftProjectionOptions<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
> {
  seasonDraftPicks: DraftPick[];
  draftPlayers: TPlayer[];
  teams: GSHLTeam[];
  take?: number;
}

function comparePlayers(
  left: Pick<
    DraftBoardPlayer,
    "overallRk" | "overallRating" | "preDraftRk" | "id"
  >,
  right: Pick<
    DraftBoardPlayer,
    "overallRk" | "overallRating" | "preDraftRk" | "id"
  >,
): number {
  const overallRankDelta = (left.overallRk ?? 9999) - (right.overallRk ?? 9999);
  if (overallRankDelta !== 0) return overallRankDelta;

  const overallDelta = (right.overallRating ?? 0) - (left.overallRating ?? 0);
  if (overallDelta !== 0) return overallDelta;

  const draftRankDelta = (left.preDraftRk ?? 9999) - (right.preDraftRk ?? 9999);
  if (draftRankDelta !== 0) return draftRankDelta;

  return String(left.id).localeCompare(String(right.id));
}

function sortProjectedPicks(
  left: ProjectedDraftPick,
  right: ProjectedDraftPick,
): number {
  return (
    Number(left.pick.round ?? 0) - Number(right.pick.round ?? 0) ||
    Number(left.pick.pick ?? 0) - Number(right.pick.pick ?? 0)
  );
}

export function buildMockDraftProjection<
  TPlayer extends DraftBoardPlayer = DraftBoardPlayer,
>(
  options: BuildMockDraftProjectionOptions<TPlayer>,
): ProjectedDraftPick<TPlayer>[] {
  const { seasonDraftPicks, draftPlayers, teams, take } = options;
  const teamById = new Map(teams.map((team) => [String(team.id), team]));
  const remainingPlayers = [...draftPlayers].sort(comparePlayers);
  const projectedPicks: ProjectedDraftPick<TPlayer>[] = [];

  for (const pick of [...seasonDraftPicks]
    .filter((x) => !x.playerId)
    .sort(
      (left, right) =>
        Number(left.round ?? 0) - Number(right.round ?? 0) ||
        Number(left.pick ?? 0) - Number(right.pick ?? 0),
    )) {
    const gshlTeam = teamById.get(String(pick.gshlTeamId));
    const projectedPlayer = remainingPlayers[0];
    const projectedPick: ProjectedDraftPick<TPlayer> = {
      pick,
      gshlTeam,
      projectedPlayer,
      score: projectedPlayer
        ? (projectedPlayer.overallRating ?? projectedPlayer.seasonRating ?? 0)
        : null,
    };

    projectedPicks.push(projectedPick);

    if (!projectedPlayer) {
      continue;
    }

    const selectedIndex = remainingPlayers.findIndex(
      (player) => player.id === projectedPlayer.id,
    );
    if (selectedIndex >= 0) {
      remainingPlayers.splice(selectedIndex, 1);
    }

    if (typeof take === "number" && projectedPicks.length >= take) {
      break;
    }
  }

  return projectedPicks.sort(sortProjectedPicks);
}

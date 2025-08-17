import {
  useAllDraftPicks,
  useAllPlayers,
  useNHLTeams,
  useTeamsBySeasonId,
} from "@gshl-hooks";
import { matchesFilter, type DraftBoardPlayer } from "../utils";
import type { Player, DraftPick } from "@gshl-types";

interface Params {
  seasonId: number;
  selectedType: string | null;
}

const isTrue = (v: unknown): boolean =>
  v === true ||
  v === 1 ||
  (typeof v === "string" && ["true", "TRUE", "yes", "YES", "1"].includes(v));

export function useDraftBoardData({ seasonId, selectedType }: Params) {
  const { data: players } = useAllPlayers();
  const { data: nhlTeams } = useNHLTeams();
  const { data: gshlTeams } = useTeamsBySeasonId(seasonId);
  const { data: draftPicks } = useAllDraftPicks();

  const isActiveFlag = (p: Pick<Player, "isActive">) => isTrue(p.isActive);
  const isSignableFlag = (p: Pick<Player, "isSignable">) =>
    isTrue(p.isSignable);
  const isUFA = (p: Pick<Player, "isResignable">) =>
    typeof p.isResignable === "string" &&
    p.isResignable.toUpperCase() === "UFA";

  const draftPlayers: DraftBoardPlayer[] = (players ?? [])
    .filter(
      (p: Player) =>
        isActiveFlag(p) &&
        (isSignableFlag(p) || (!isSignableFlag(p) && isUFA(p))),
    )
    .sort(
      (a: Player, b: Player) => (b.overallRating ?? 0) - (a.overallRating ?? 0),
    );

  const filteredPlayers: DraftBoardPlayer[] = draftPlayers.filter((p) =>
    matchesFilter(p, selectedType),
  );

  const seasonDraftPicks: DraftPick[] = (draftPicks ?? [])
    .filter((p: DraftPick) => p.seasonId === seasonId)
    .sort((a: DraftPick, b: DraftPick) => a.round - b.round || a.pick - b.pick);

  return {
    isLoading: !players,
    draftPlayers,
    filteredPlayers,
    seasonDraftPicks,
    nhlTeams: nhlTeams ?? [],
    gshlTeams: gshlTeams ?? [],
  };
}

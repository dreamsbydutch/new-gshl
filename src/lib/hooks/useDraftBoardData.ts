import {
  useAllDraftPicks,
  useAllPlayers,
  useNHLTeams,
  useTeamsBySeasonId,
} from "@gshl-hooks";
import { matchesFilter, type DraftBoardPlayer } from "@gshl-utils";
import type { Player, DraftPick } from "@gshl-types";

interface Params {
  seasonId: string;
  selectedType: string | null;
}

export function useDraftBoardData({ seasonId, selectedType }: Params) {
  const { data: players } = useAllPlayers();
  const { data: nhlTeams } = useNHLTeams();
  const { data: gshlTeams } = useTeamsBySeasonId(seasonId);
  const { data: draftPicks } = useAllDraftPicks();

  const seasonDraftPicks: DraftPick[] = (draftPicks ?? [])
    .filter((p: DraftPick) => p.seasonId === seasonId)
    .sort(
      (a: DraftPick, b: DraftPick) => +a.round - +b.round || +a.pick - +b.pick,
    );

  const draftPlayers: DraftBoardPlayer[] = (players ?? [])
    .filter((p: Player) => p.isActive && !p.gshlTeamId)
    .sort(
      (a: Player, b: Player) => (b.overallRating ?? 0) - (a.overallRating ?? 0),
    )
    .sort((a, b) => +(a.preDraftRk ?? 9999) - +(b.preDraftRk ?? 9999));

  const filteredPlayers: DraftBoardPlayer[] = draftPlayers.filter((p) =>
    matchesFilter(p, selectedType),
  );

  return {
    isLoading: !players,
    draftPlayers,
    filteredPlayers,
    seasonDraftPicks,
    nhlTeams: nhlTeams ?? [],
    gshlTeams: gshlTeams ?? [],
  };
}

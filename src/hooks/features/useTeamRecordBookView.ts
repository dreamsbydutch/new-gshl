"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  RecordBookGroup,
  RecordBookSortKey,
  RecordBookSortState,
  RecordBookView,
  SeasonType as SeasonTypeValue,
  TeamRecordBookProps,
  UseTeamRecordBookViewResult,
} from "@gshl-types";
import {
  buildRecordBookAwardRows,
  buildRecordBookPlayerRows,
  getOwnerTeamIds,
  PositionGroup,
  RECORD_BOOK_GOALIE_COLUMNS,
  RECORD_BOOK_SKATER_COLUMNS,
  SeasonType,
  sortRecordBookPlayerRows,
} from "@gshl-utils";

const SEASON_TYPE_ORDER: SeasonTypeValue[] = [
  SeasonType.REGULAR_SEASON,
  SeasonType.PLAYOFFS,
  SeasonType.LOSERS_TOURNAMENT,
];

function getDefaultPlayerSortKey(group: RecordBookGroup): RecordBookSortKey {
  return group === "goalie" ? "W" : "P";
}

function getDefaultSort(
  view: RecordBookView,
  group: RecordBookGroup,
): RecordBookSortState {
  if (view === "season") {
    return { key: "seasonYear", direction: "desc" };
  }
  return { key: getDefaultPlayerSortKey(group), direction: "desc" };
}

function getNewSortDirection(key: RecordBookSortKey): "asc" | "desc" {
  return key === "playerName" || key === "positions" || key === "GAA"
    ? "asc"
    : "desc";
}

export function useTeamRecordBookView(
  props: TeamRecordBookProps,
): UseTeamRecordBookViewResult {
  const {
    allTeams,
    careerSplits,
    currentTeam,
    nhlTeams,
    playerAwards,
    playerTotals,
    players,
    seasonSplits,
    seasons,
  } = props;
  const [view, setView] = useState<RecordBookView>("career");
  const [group, setGroup] = useState<RecordBookGroup>("skater");
  const [seasonType, setSeasonType] = useState<SeasonTypeValue>(
    SeasonType.REGULAR_SEASON,
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<RecordBookSortState>(() =>
    getDefaultSort("career", "skater"),
  );

  const playersById = useMemo(
    () => new Map(players.map((player) => [String(player.id), player])),
    [players],
  );
  const nhlTeamsByAbbr = useMemo(
    () => new Map(nhlTeams.map((team) => [team.abbr, team])),
    [nhlTeams],
  );
  const seasonsById = useMemo(
    () => new Map(seasons.map((season) => [String(season.id), season.year])),
    [seasons],
  );
  const ownerTeamIds = useMemo(
    () => getOwnerTeamIds(allTeams, currentTeam),
    [allTeams, currentTeam],
  );
  const allAwardRows = useMemo(
    () =>
      buildRecordBookAwardRows({
        allTeams,
        currentTeam,
        nhlTeamsByAbbr,
        playerAwards,
        playerTotals,
        playersById,
        seasonsById,
      }),
    [
      allTeams,
      currentTeam,
      nhlTeamsByAbbr,
      playerAwards,
      playerTotals,
      playersById,
      seasonsById,
    ],
  );
  const playerRowSets = useMemo(
    () =>
      buildRecordBookPlayerRows({
        awardRows: allAwardRows,
        careerSplits,
        ownerTeamIds,
        nhlTeamsByAbbr,
        playersById,
        seasonSplits,
        seasonsById,
      }),
    [
      careerSplits,
      allAwardRows,
      ownerTeamIds,
      nhlTeamsByAbbr,
      playersById,
      seasonSplits,
      seasonsById,
    ],
  );
  const seasonTypes = useMemo(() => {
    const availableTypes = new Set(
      [...playerRowSets.careerRows, ...playerRowSets.seasonRows].map(
        (row) => row.seasonType,
      ),
    );
    const ordered = SEASON_TYPE_ORDER.filter((value) =>
      availableTypes.has(value),
    );
    return ordered.length > 0 ? ordered : [SeasonType.REGULAR_SEASON];
  }, [playerRowSets]);
  const selectedSeasonType = seasonTypes.includes(seasonType)
    ? seasonType
    : (seasonTypes[0] ?? SeasonType.REGULAR_SEASON);
  const columns =
    group === "goalie"
      ? RECORD_BOOK_GOALIE_COLUMNS
      : RECORD_BOOK_SKATER_COLUMNS;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const playerRows = useMemo(() => {
    const source =
      view === "season" ? playerRowSets.seasonRows : playerRowSets.careerRows;
    const filtered = source.filter((row) => {
      const isGoalie = row.positionGroup === PositionGroup.G;
      if (row.seasonType !== selectedSeasonType) return false;
      if (group === "goalie" ? !isGoalie : isGoalie) return false;
      if (!normalizedQuery) return true;
      return [
        row.playerName,
        row.positions,
        row.seasonYear,
        row.firstSeason,
        row.lastSeason,
      ].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
      );
    });
    return sortRecordBookPlayerRows(filtered, sort);
  }, [group, normalizedQuery, playerRowSets, selectedSeasonType, sort, view]);
  const onViewChange = useCallback(
    (nextView: RecordBookView) => {
      setView(nextView);
      setSort(getDefaultSort(nextView, group));
    },
    [group],
  );
  const onGroupChange = useCallback(
    (nextGroup: RecordBookGroup) => {
      setGroup(nextGroup);
      setSort(getDefaultSort(view, nextGroup));
    },
    [view],
  );
  const onSeasonTypeChange = useCallback((nextSeasonType: SeasonTypeValue) => {
    setSeasonType(nextSeasonType);
  }, []);
  const onSort = useCallback((key: RecordBookSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key
          ? current.direction === "asc"
            ? "desc"
            : "asc"
          : getNewSortDirection(key),
    }));
  }, []);
  return {
    columns,
    group,
    onGroupChange,
    onSeasonTypeChange,
    onSort,
    onViewChange,
    playerRows,
    query,
    seasonType: selectedSeasonType,
    seasonTypes,
    setQuery,
    sort,
    view,
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import type {
  FranchiseCareerRow,
  NHLTeam,
  Player,
  PlayerSplitStatLine,
  RecordBookAwardRow,
  RecordBookStatColumn,
  AwardsList as AwardsListType,
  SeasonType as SeasonTypeValue,
} from "@gshl-types";
import { AwardsList, PositionGroup, SeasonType } from "../domain/constants";
import {
  buildAllTimeFranchiseRoster,
  buildRecordBookPlayerRows,
  formatRecordBookStat,
  getOwnerTeamIds,
  getRecordBookAwardSeasonType,
  getRecordBookPriorityColumns,
  RECORD_BOOK_GOALIE_COLUMNS,
  RECORD_BOOK_SKATER_COLUMNS,
} from "./team-record-book";

void test("scopes record-book team history to the selected owner", () => {
  const ownerTeamIds = getOwnerTeamIds(
    [
      { id: "owner-a-team-1", ownerId: "owner-a" },
      { id: "owner-b-team-1", ownerId: "owner-b" },
      { id: "owner-a-team-2", ownerId: "owner-a" },
    ],
    { ownerId: "owner-a" },
  );

  assert.deepEqual([...ownerTeamIds], ["owner-a-team-1", "owner-a-team-2"]);
});

function seasonSplitRow(
  overrides: Partial<PlayerSplitStatLine> = {},
): PlayerSplitStatLine {
  return {
    id: "split-1",
    seasonId: "season-1",
    gshlTeamId: "owner-a-team-1",
    playerId: "player-1",
    nhlPos: [],
    posGroup: PositionGroup.F,
    nhlTeam: "TOR",
    seasonType: SeasonType.REGULAR_SEASON,
    days: "10",
    GP: "1",
    MG: "",
    IR: "",
    IRplus: "",
    GS: "",
    G: "0",
    A: "",
    P: "",
    PM: "",
    PIM: "",
    PPP: "",
    SOG: "",
    HIT: "",
    BLK: "",
    W: "",
    GA: "",
    GAA: "",
    SV: "",
    SA: "",
    SVP: "",
    SO: "",
    TOI: "",
    Rating: "",
    ADD: "",
    MS: "",
    BS: "",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function nhlTeam(id: string, abbr: string): NHLTeam {
  return {
    id,
    name: `${abbr} team`,
    abbr,
    logoUrl: `https://example.com/${abbr}.png`,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function awardRow(
  award: AwardsListType,
  seasonType: SeasonTypeValue = SeasonType.REGULAR_SEASON,
): RecordBookAwardRow {
  return {
    id: `${award}-${seasonType}`,
    playerId: "player-1",
    playerName: "Player 1",
    nhlTeam: undefined,
    positions: "C",
    seasonId: "season-1",
    seasonYear: 2025,
    seasonType,
    award,
    awardLabel: String(award),
  };
}

void test("renders uncounted categories as dashes without hiding counted zeroes", () => {
  const { seasonRows } = buildRecordBookPlayerRows({
    awardRows: [],
    careerSplits: [],
    nhlTeamsByAbbr: new Map(),
    ownerTeamIds: new Set(["owner-a-team-1"]),
    playersById: new Map(),
    seasonSplits: [seasonSplitRow()],
    seasonsById: new Map([["season-1", 2025]]),
  });
  const row = seasonRows[0];
  if (!row) throw new Error("Expected a season record-book row");

  const goalsColumn = {
    key: "G",
    label: "G",
    title: "Goals",
  } satisfies RecordBookStatColumn;
  const assistsColumn = {
    key: "A",
    label: "A",
    title: "Assists",
  } satisfies RecordBookStatColumn;

  assert.equal(formatRecordBookStat(row, goalsColumn), "0");
  assert.equal(formatRecordBookStat(row, assistsColumn), "-");
});

void test("keeps every NHL team from a season stat row ahead of the live team", () => {
  const toronto = nhlTeam("toronto", "TOR");
  const montreal = nhlTeam("montreal", "MTL");
  const newJersey = nhlTeam("new-jersey", "NJD");
  const { seasonRows } = buildRecordBookPlayerRows({
    awardRows: [],
    careerSplits: [],
    nhlTeamsByAbbr: new Map(
      [toronto, montreal, newJersey].map((team) => [team.abbr, team]),
    ),
    ownerTeamIds: new Set(["owner-a-team-1"]),
    playersById: new Map([
      [
        "player-1",
        {
          id: "player-1",
          firstName: "Gem",
          lastName: "Stone",
          fullName: "Gem Stone",
          nhlPos: [],
          posGroup: PositionGroup.F,
          nhlTeam: "NJD",
          isActive: true,
          isSignable: true,
          isResignable: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        },
      ],
    ]),
    seasonSplits: [seasonSplitRow({ nhlTeam: ["TOR", "MTL"] })],
    seasonsById: new Map([["season-1", 2025]]),
  });

  assert.deepEqual(
    seasonRows[0]?.nhlTeams.map((team) => team.abbr),
    ["TOR", "MTL"],
  );
});

void test("counts all-star and player trophies in the matching table season", () => {
  const { seasonRows } = buildRecordBookPlayerRows({
    awardRows: [
      awardRow(AwardsList.GRETZKY),
      awardRow(AwardsList.CROSBY),
      awardRow(AwardsList.FIRST_AS),
      awardRow(AwardsList.PLAYOFF_AS, SeasonType.PLAYOFFS),
      awardRow(AwardsList.CONN_SMYTHE, SeasonType.PLAYOFFS),
    ],
    careerSplits: [],
    nhlTeamsByAbbr: new Map(),
    ownerTeamIds: new Set(["owner-a-team-1"]),
    playersById: new Map(),
    seasonSplits: [
      seasonSplitRow(),
      seasonSplitRow({ id: "split-playoffs", seasonType: SeasonType.PLAYOFFS }),
    ],
    seasonsById: new Map([["season-1", 2025]]),
  });

  const regularRow = seasonRows.find(
    (row) => row.seasonType === SeasonType.REGULAR_SEASON,
  );
  const playoffRow = seasonRows.find(
    (row) => row.seasonType === SeasonType.PLAYOFFS,
  );
  if (!regularRow || !playoffRow) {
    throw new Error("Expected regular-season and playoff record-book rows");
  }

  assert.equal(regularRow.awardCounts[AwardsList.GRETZKY], 1);
  assert.equal(regularRow.awardCounts[AwardsList.CROSBY], 1);
  assert.equal(regularRow.awardCounts[AwardsList.FIRST_AS], 1);
  assert.equal(regularRow.awardCounts[AwardsList.PLAYOFF_AS], undefined);
  assert.equal(playoffRow.awardCounts[AwardsList.PLAYOFF_AS], 1);
  assert.equal(playoffRow.awardCounts[AwardsList.CONN_SMYTHE], 1);
});

void test("assigns the Conn Smythe to playoff record-book rows", () => {
  assert.equal(
    getRecordBookAwardSeasonType(AwardsList.CONN_SMYTHE),
    SeasonType.PLAYOFFS,
  );
  assert.equal(
    getRecordBookAwardSeasonType(AwardsList.CROSBY),
    SeasonType.REGULAR_SEASON,
  );
});

void test("selects useful mobile summaries without dropping table columns", () => {
  assert.deepEqual(
    getRecordBookPriorityColumns("skater", RECORD_BOOK_SKATER_COLUMNS).map(
      (column) => column.key,
    ),
    ["GP", "G", "A", "P"],
  );
  assert.deepEqual(
    getRecordBookPriorityColumns("goalie", RECORD_BOOK_GOALIE_COLUMNS).map(
      (column) => column.key,
    ),
    ["GP", "W", "GAA", "SVP"],
  );
  assert.equal(RECORD_BOOK_SKATER_COLUMNS.length, 11);
  assert.equal(RECORD_BOOK_GOALIE_COLUMNS.length, 11);
});

function careerRow(
  playerId: string,
  posGroup: string,
  nhlPos: string[],
  stats: { P?: number; G?: number; A?: number; W?: number; SVP?: number } = {},
): FranchiseCareerRow {
  return {
    playerId,
    seasonType: SeasonType.REGULAR_SEASON,
    posGroup,
    nhlPos,
    nhlTeams: [],
    days: 0,
    GP: 40,
    GS: 0,
    G: stats.G ?? 0,
    A: stats.A ?? 0,
    P: stats.P ?? 0,
    PM: 0,
    PIM: 0,
    PPP: 0,
    SOG: 0,
    HIT: 0,
    BLK: 0,
    W: stats.W ?? 0,
    GA: 0,
    SV: 0,
    SA: 0,
    SO: 0,
    TOI: 0,
    GAA: null,
    SVP: stats.SVP ?? null,
  };
}

void test("builds a unique all-time lineup from the best positional splits", () => {
  const rows = [
    careerRow("center", "F", ["C"], { P: 100, G: 40, A: 60 }),
    careerRow("left-wing", "F", ["LW"], { P: 90, G: 35, A: 55 }),
    careerRow("right-wing", "F", ["RW"], { P: 80, G: 30, A: 50 }),
    careerRow("defense-one", "D", ["D"], { P: 75, G: 20, A: 55 }),
    careerRow("defense-two", "D", ["D"], { P: 70, G: 18, A: 52 }),
    careerRow("defense-three", "D", ["D"], { P: 60, G: 15, A: 45 }),
    careerRow("goalie-one", "G", ["G"], { W: 45, SVP: 0.92 }),
    careerRow("goalie-two", "G", ["G"], { W: 40, SVP: 0.95 }),
    {
      ...careerRow("center", "F", ["C"], { P: 999 }),
      seasonType: SeasonType.PLAYOFFS,
    },
  ];
  const playersById = new Map<string, Player>();
  const nhlTeamsByAbbr = new Map<string, NHLTeam>();

  const lineup = buildAllTimeFranchiseRoster(rows, playersById, nhlTeamsByAbbr);

  assert.deepEqual(
    lineup.map((entry) => [entry.slot, entry.playerId]),
    [
      ["C", "center"],
      ["LW", "left-wing"],
      ["RW", "right-wing"],
      ["D", "defense-one"],
      ["D", "defense-two"],
      ["G", "goalie-one"],
    ],
  );
  assert.equal(new Set(lineup.map((entry) => entry.playerId)).size, 6);
});

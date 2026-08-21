import assert from "node:assert/strict";
import test from "node:test";

import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { calculateOddsForGroup } from "./ufa";
import { loadUfaOddsData, type UfaOddsData } from "./ufaOdds";

type Row = Record<string, unknown> & { _id: string };
type Equality = { field: string; value: unknown };
type QueryRead = {
  table: string;
  index: string | null;
  equality: Equality | null;
};

type IndexRange = {
  eq: (field: string, value: unknown) => IndexRange;
};

type QueryBuilder = {
  withIndex: (
    index: string,
    applyRange: (range: IndexRange) => IndexRange,
  ) => QueryBuilder;
  collect: () => Promise<Row[]>;
};

const INDEX_REQUIREMENTS: Record<string, { index: string; field: string }> = {
  contracts: { index: "by_ownerId", field: "ownerId" },
  teams: { index: "by_seasonId", field: "seasonId" },
  matchups: { index: "by_seasonId", field: "seasonId" },
  teamAwards: { index: "by_seasonId", field: "seasonId" },
  draftPicks: { index: "by_seasonId", field: "seasonId" },
  playerNhlStatLines: { index: "by_seasonId", field: "seasonId" },
};

function createStrictFakeDb(tables: Record<string, Row[]>) {
  const reads: QueryRead[] = [];
  const gets: string[] = [];
  const documents = new Map(
    Object.values(tables)
      .flat()
      .map((row) => [row._id, row]),
  );

  const db = {
    query(table: string): QueryBuilder {
      if (!(table in tables))
        throw new Error(`Unexpected table query: ${table}`);

      let index: string | null = null;
      let equality: Equality | null = null;
      let collected = false;
      const builder: QueryBuilder = {
        withIndex(indexName, applyRange) {
          if (index !== null) {
            throw new Error(`withIndex called twice for ${table}`);
          }
          index = indexName;
          const range: IndexRange = {
            eq(field, value) {
              if (equality !== null) {
                throw new Error(`Multiple index equalities for ${table}`);
              }
              equality = { field, value };
              return range;
            },
          };
          applyRange(range);
          return builder;
        },
        async collect() {
          if (collected) throw new Error(`collect called twice for ${table}`);
          collected = true;

          const requirement = INDEX_REQUIREMENTS[table];
          if (requirement) {
            if (index !== requirement.index) {
              throw new Error(
                `${table} must use ${requirement.index}, received ${String(index)}`,
              );
            }
            if (equality?.field !== requirement.field) {
              throw new Error(
                `${table} must constrain ${requirement.field}, received ${String(equality?.field)}`,
              );
            }
          } else if (index !== null || equality !== null) {
            throw new Error(`${table} must be collected without an index`);
          }

          reads.push({ table, index, equality });
          const rows = tables[table] ?? [];
          const filter = equality;
          return filter
            ? rows.filter((row) => row[filter.field] === filter.value)
            : [...rows];
        },
      };
      return builder;
    },
    async get(id: unknown) {
      const key = String(id);
      gets.push(key);
      return documents.get(key) ?? null;
    },
  };

  return { db, gets, reads };
}

const idsReadFor = (reads: QueryRead[], table: string) =>
  reads
    .filter((read) => read.table === table)
    .map((read) => String(read.equality?.value))
    .sort();

void test("loads shared UFA odds inputs once and narrows selective reads", async () => {
  const seasons: Row[] = [
    { _id: "season-2024", year: "2024" },
    { _id: "season-2025", year: "2025" },
    { _id: "season-2026", year: "2026" },
    { _id: "season-2027", year: "2027" },
    { _id: "season-2028", year: "2028" },
    { _id: "season-2029", year: "2029" },
  ];
  const players: Row[] = [
    { _id: "active-group-player", isActive: true, posGroup: "F" },
    { _id: "active-contract-player", isActive: true, posGroup: "D" },
    { _id: "active-peer", isActive: true, posGroup: "F" },
    { _id: "inactive-group-player", isActive: false, posGroup: "G" },
    { _id: "inactive-contract-player", isActive: false, posGroup: "F" },
  ];
  const contracts: Row[] = [
    {
      _id: "contract-a",
      ownerId: "owner-a",
      playerId: "inactive-contract-player",
    },
    {
      _id: "contract-b",
      ownerId: "owner-b",
      playerId: "active-contract-player",
    },
    {
      _id: "contract-ignored",
      ownerId: "owner-ignored",
      playerId: "inactive-contract-player",
    },
  ];
  const teams: Row[] = seasons.map((season) => ({
    _id: `team-${String(season.year)}`,
    seasonId: season._id,
    franchiseId: "franchise-a",
  }));
  const groups: Row[] = [
    {
      _id: "group-a",
      playerId: "inactive-group-player",
      seasonId: "season-2025",
      status: "open",
    },
    {
      _id: "group-b",
      playerId: "active-group-player",
      seasonId: "season-2025",
      status: "open",
    },
  ];
  const offers: Row[] = [
    {
      _id: "offer-a-1",
      groupId: "group-a",
      ownerId: "owner-a",
      status: "pending",
    },
    {
      _id: "offer-a-2",
      groupId: "group-b",
      ownerId: "owner-a",
      status: "pending",
    },
    {
      _id: "offer-b",
      groupId: "group-b",
      ownerId: "owner-b",
      status: "pending",
    },
    {
      _id: "offer-not-pending",
      groupId: "group-a",
      ownerId: "owner-ignored",
      status: "lost",
    },
    {
      _id: "offer-other-group",
      groupId: "closed-group",
      ownerId: "owner-ignored",
      status: "pending",
    },
  ];
  const matchups: Row[] = [
    { _id: "matchup-2024", seasonId: "season-2024" },
    { _id: "matchup-2025", seasonId: "season-2025" },
    { _id: "matchup-future", seasonId: "season-2026" },
  ];
  const teamAwards: Row[] = [
    { _id: "award-2024", seasonId: "season-2024" },
    { _id: "award-2025", seasonId: "season-2025" },
    { _id: "award-future", seasonId: "season-2026" },
  ];
  const draftPicks: Row[] = [
    { _id: "pick-2026", seasonId: "season-2026" },
    { _id: "pick-2027", seasonId: "season-2027" },
    { _id: "pick-2028", seasonId: "season-2028" },
    { _id: "pick-outside-window", seasonId: "season-2029" },
  ];
  const playerNhlStatLines: Row[] = [
    {
      _id: "nhl-stat-2024",
      seasonId: "season-2024",
      playerId: "active-group-player",
    },
    {
      _id: "nhl-stat-future",
      seasonId: "season-2026",
      playerId: "active-group-player",
    },
  ];
  const fake = createStrictFakeDb({
    seasons,
    players,
    contracts,
    teams,
    franchises: [
      { _id: "franchise-a", ownerId: "owner-a" },
      { _id: "franchise-b", ownerId: "owner-b" },
    ],
    matchups,
    teamAwards,
    draftPicks,
    playerNhlStatLines,
  });

  const data = await loadUfaOddsData(
    fake.db as unknown as DatabaseReader,
    groups as unknown as Doc<"ufaOfferGroups">[],
    offers as unknown as Doc<"ufaOffers">[],
  );

  assert.deepEqual(
    fake.reads
      .filter((read) => read.table === "players")
      .map((read) => [read.index, read.equality]),
    [[null, null]],
  );
  assert.deepEqual(idsReadFor(fake.reads, "contracts"), ["owner-a", "owner-b"]);
  assert.deepEqual(idsReadFor(fake.reads, "teams"), [
    "season-2024",
    "season-2025",
    "season-2026",
    "season-2027",
    "season-2028",
    "season-2029",
  ]);
  assert.deepEqual(idsReadFor(fake.reads, "matchups"), [
    "season-2024",
    "season-2025",
    "season-2026",
    "season-2027",
    "season-2028",
    "season-2029",
  ]);
  assert.deepEqual(idsReadFor(fake.reads, "teamAwards"), [
    "season-2024",
    "season-2025",
    "season-2026",
    "season-2027",
    "season-2028",
    "season-2029",
  ]);
  for (const table of ["teams", "matchups", "teamAwards"]) {
    assert.ok(
      fake.reads
        .filter((read) => read.table === table)
        .every(
          (read) =>
            read.index === "by_seasonId" && read.equality?.field === "seasonId",
        ),
    );
  }

  assert.deepEqual(fake.gets, []);
  assert.equal(
    data.playerById.get("inactive-group-player")?._id,
    "inactive-group-player",
  );
  assert.equal(
    data.playerById.get("inactive-contract-player")?._id,
    "inactive-contract-player",
  );
  assert.deepEqual(
    data.matchups.map((row) => row._id),
    ["matchup-2024", "matchup-2025", "matchup-future"],
  );
  assert.deepEqual(
    data.teamAwards.map((row) => row._id),
    ["award-2024", "award-2025", "award-future"],
  );

  const signingSeasonId = "season-2025" as Id<"seasons">;
  const firstWindow = data.loadSigningWindow(signingSeasonId);
  const secondWindow = data.loadSigningWindow(signingSeasonId);
  assert.strictEqual(secondWindow, firstWindow);
  const [firstResult, secondResult] = await Promise.all([
    firstWindow,
    secondWindow,
  ]);
  assert.strictEqual(secondResult, firstResult);
  assert.deepEqual(
    firstResult.picks.map((row) => row._id),
    ["pick-2026", "pick-2027", "pick-2028"],
  );
  assert.deepEqual(
    firstResult.nhlStats.map((row) => row._id),
    ["nhl-stat-2024"],
  );
  assert.deepEqual(idsReadFor(fake.reads, "draftPicks"), [
    "season-2026",
    "season-2027",
    "season-2028",
  ]);
  assert.deepEqual(idsReadFor(fake.reads, "playerNhlStatLines"), [
    "season-2024",
    "season-2025",
  ]);
});

void test("shared odds data preserves the existing full-player probability formula", async () => {
  const seasons = [
    { _id: "prior", year: 2024 },
    { _id: "signing", year: 2025 },
    { _id: "future-one", year: 2026 },
    { _id: "future-two", year: 2027 },
    { _id: "future-three", year: 2028 },
  ];
  const player = {
    _id: "player",
    isActive: true,
    posGroup: "F",
    overallRating: 50,
  };
  const inactivePeer = {
    _id: "inactive-peer",
    isActive: false,
    posGroup: "F",
    overallRating: 0,
  };
  const group = {
    _id: "group",
    playerId: "player",
    seasonId: "signing",
    status: "open",
  };
  const offers = [
    {
      _id: "offer-one",
      groupId: "group",
      ownerId: "owner-one",
      franchiseId: "franchise-one",
      contractLength: 1,
      status: "pending",
    },
    {
      _id: "offer-three",
      groupId: "group",
      ownerId: "owner-three",
      franchiseId: "franchise-three",
      contractLength: 3,
      status: "pending",
    },
  ];
  const oddsData = {
    contracts: [],
    franchises: [
      { _id: "franchise-one", ownerId: "owner-one" },
      { _id: "franchise-three", ownerId: "owner-three" },
    ],
    loadSigningWindow: async () => ({
      nhlStats: [
        {
          _id: "player-stats",
          seasonId: "signing",
          playerId: "player",
          overallRating: 50,
        },
      ],
      picks: [],
    }),
    matchups: [],
    orderedSeasons: seasons,
    playerById: new Map([
      ["player", player],
      ["inactive-peer", inactivePeer],
    ]),
    players: [player, inactivePeer],
    teamAwards: [],
    teams: [],
  } as unknown as UfaOddsData;

  const result = await calculateOddsForGroup(group, offers, oddsData);
  const oneYear = result.factors.get("offer-one") as {
    playerPerformance: number;
    rosterFit: number;
    score: number;
  };
  const threeYear = result.factors.get("offer-three") as {
    score: number;
  };
  const probability = (offerId: string) =>
    result.odds.find((entry) => entry.offerId === offerId)?.probability;

  assert.equal(oneYear.playerPerformance, 1);
  assert.equal(oneYear.rosterFit, 0.675);
  assert.ok(Math.abs(oneYear.score - 0.41875) < 1e-12);
  assert.ok(Math.abs(threeYear.score - 0.66875) < 1e-12);
  assert.ok(
    Math.abs((probability("offer-one") ?? 0) - 0.33873917074214627) < 1e-12,
  );
  assert.ok(
    Math.abs((probability("offer-three") ?? 0) - 0.6612608292578537) < 1e-12,
  );
});

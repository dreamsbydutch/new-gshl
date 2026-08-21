import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseReader } from "../_generated/server";
import { loadUfaCatalog } from "./ufaCatalog";

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
  players: { index: "by_isActive_overallRating", field: "isActive" },
  teams: { index: "by_seasonId", field: "seasonId" },
  playerNhlStatLines: { index: "by_seasonId", field: "seasonId" },
};

function createStrictFakeDb(tables: Record<string, Row[]>) {
  const reads: QueryRead[] = [];
  const gets: unknown[] = [];

  const db = {
    query(table: string): QueryBuilder {
      if (!(table in tables)) {
        throw new Error(`Unexpected table query: ${table}`);
      }

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
      gets.push(id);
      throw new Error(`Unexpected document lookup: ${String(id)}`);
    },
  };

  return { db, gets, reads };
}

const readsFor = (reads: QueryRead[], table: string) =>
  reads.filter((read) => read.table === table);

void test("loads the UFA catalog with bounded season-scoped reads", async () => {
  const fake = createStrictFakeDb({
    seasons: [
      { _id: "season-2027", year: 2027 },
      { _id: "season-2024", year: 2024 },
      { _id: "season-2026", year: 2026, isActive: true },
      { _id: "season-2025", year: 2025 },
    ],
    players: [
      { _id: "player-active", isActive: true },
      { _id: "player-inactive", isActive: false },
    ],
    nhlTeams: [{ _id: "nhl-team" }],
    franchises: [{ _id: "franchise" }],
    teams: [
      { _id: "team-current", seasonId: "season-2026" },
      { _id: "team-prior", seasonId: "season-2025" },
    ],
    contracts: [{ _id: "contract" }],
    playerNhlStatLines: [
      {
        _id: "nhl-stat-history",
        playerId: "player-active",
        seasonId: "season-2024",
      },
      {
        _id: "nhl-stat-latest",
        playerId: "player-active",
        seasonId: "season-2025",
      },
      {
        _id: "nhl-stat-future",
        playerId: "player-active",
        seasonId: "season-2027",
      },
    ],
  });

  const result = await loadUfaCatalog(fake.db as unknown as DatabaseReader);

  assert.deepEqual(
    readsFor(fake.reads, "players").map((read) => [read.index, read.equality]),
    [["by_isActive_overallRating", { field: "isActive", value: true }]],
  );
  assert.deepEqual(
    result.players.map((player) => player._id),
    ["player-active"],
  );

  assert.deepEqual(
    readsFor(fake.reads, "teams").map((read) => [read.index, read.equality]),
    [["by_seasonId", { field: "seasonId", value: "season-2026" }]],
  );
  assert.deepEqual(
    result.teams.map((team) => team._id),
    ["team-current"],
  );

  const statReads = readsFor(fake.reads, "playerNhlStatLines");
  assert.deepEqual(
    statReads.map((read) => [read.index, read.equality]),
    [
      ["by_seasonId", { field: "seasonId", value: "season-2026" }],
      ["by_seasonId", { field: "seasonId", value: "season-2025" }],
    ],
  );
  assert.deepEqual(
    result.nhlStats.map((stat) => stat._id),
    ["nhl-stat-latest"],
  );
  assert.ok(
    !statReads.some(
      (read) =>
        read.equality?.field === "playerId" ||
        read.equality?.value === "season-2024" ||
        read.equality?.value === "season-2027",
    ),
  );
  assert.deepEqual(fake.gets, []);
});

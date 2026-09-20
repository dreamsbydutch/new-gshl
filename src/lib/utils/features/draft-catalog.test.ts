import assert from "node:assert/strict";
import test from "node:test";
import type { Contract, NHLTeam, Player } from "@gshl-types";
import {
  buildDraftPlayerCatalog,
  filterDraftPlayerCatalog,
} from "./draft-board-list";
import { indexLatestUfaNhlStats } from "./ufa";

const date = new Date("2026-01-01");
function player(id: string, fields: Partial<Player> = {}): Player {
  return {
    id,
    firstName: id,
    lastName: "Player",
    fullName: `${id} Player`,
    nhlPos: ["C"],
    posGroup: "F",
    nhlTeam: "TOR",
    isActive: true,
    isSignable: true,
    isResignable: null,
    createdAt: date,
    updatedAt: date,
    ...fields,
  };
}
function contract(playerId: string, fields: Partial<Contract> = {}): Contract {
  return {
    id: `contract-${playerId}`,
    playerId,
    ownerId: "owner",
    seasonId: "season",
    contractType: ["STANDARD"],
    contractLength: 1,
    contractSalary: 1000000,
    signingDate: "2026-07-01",
    startDate: "2026-10-01",
    signingStatus: "Drafted",
    expiryStatus: "UFA",
    expiryDate: "2027-06-30",
    capHitEndDate: fields.expiryDate ?? "2027-06-30",
    capHit: 1000000,
    createdAt: date,
    updatedAt: date,
    ...fields,
  };
}
const nhlTeams: NHLTeam[] = [
  {
    id: "njd",
    name: "New Jersey",
    abbr: "NJD",
    logoUrl: "devils.png",
    createdAt: date,
    updatedAt: date,
  },
];

void test("catalog combines eligibility, selected exclusions, aliases and missing enrichment without mutation", () => {
  const players = [
    player("low", { overallRk: 10 }),
    player("alias", { nhlTeam: " NJ ", overallRk: 2 }),
    player("selected"),
    player("signed"),
    player("inactive", { isActive: false }),
  ];
  const contracts = [contract("signed")];
  const snapshot = structuredClone({ players, contracts, nhlTeams });
  const catalog = buildDraftPlayerCatalog({
    players,
    contracts,
    nhlTeams,
    activeOn: "2026-10-01",
    selectedPlayerIds: ["selected"],
    latestStats: new Map([["alias", { GP: "82", G: "30" }]]),
  });
  assert.deepEqual(
    catalog.map((row) => row.id),
    ["alias", "low"],
  );
  assert.equal(catalog[0]?.nhlTeamLogoUrl, "devils.png");
  assert.equal(catalog[0]?.stats?.G, "30");
  assert.equal(catalog[1]?.nhlTeamLogoUrl, null);
  assert.equal(catalog[1]?.stats, null);
  assert.deepEqual({ players, contracts, nhlTeams }, snapshot);
});

void test("catalog preserves inclusive contract coverage, cap-hit end dates and buyouts", () => {
  const players = [
    "opening",
    "ending",
    "extended",
    "expired",
    "buyout",
    "buyout-signing",
  ].map((id) => player(id));
  const contracts = [
    contract("opening"),
    contract("ending", { expiryDate: "2026-10-01" }),
    contract("extended", {
      expiryDate: "2026-01-01",
      capHitEndDate: "2027-01-01",
    }),
    contract("expired", { expiryDate: "2026-09-30" }),
    contract("buyout", { expiryStatus: "Buyout" }),
    contract("buyout-signing", { signingStatus: "Buyout" }),
  ];
  const input = {
    players,
    contracts,
    nhlTeams: [],
    selectedPlayerIds: [],
    latestStats: new Map(),
  };
  assert.deepEqual(
    buildDraftPlayerCatalog({ ...input, activeOn: "2026-10-01" }).map(
      (row) => row.id,
    ),
    ["expired", "buyout", "buyout-signing"],
  );
  assert.deepEqual(
    buildDraftPlayerCatalog(input).map((row) => row.id),
    ["buyout", "buyout-signing"],
  );
});

void test("catalog consumes the globally latest eligible stat season, not each player's latest", () => {
  const latestStats = indexLatestUfaNhlStats(
    [
      { playerId: "old-only", seasonId: "old", GP: "50" },
      { playerId: "recent", seasonId: "current", GP: "82" },
      { playerId: "recent", seasonId: "future", GP: "99" },
    ],
    [
      { id: "old", year: 2025 },
      { id: "current", year: 2026 },
      { id: "future", year: 2027 },
    ],
    2026,
  );
  const catalog = buildDraftPlayerCatalog({
    players: [player("old-only"), player("recent")],
    contracts: [],
    nhlTeams: [],
    selectedPlayerIds: [],
    latestStats,
  });
  assert.equal(catalog[0]?.stats, null);
  assert.equal(catalog[1]?.stats?.GP, "82");
});

void test("hub catalog filters group and individual positions, normalizes search and sorts stats", () => {
  const players = [
    player("center", { overallRk: 3 }),
    player("wing", { nhlPos: ["LW"], nhlTeam: "NJD", overallRk: 1 }),
    player("goalie", { nhlPos: ["G"], posGroup: "G", overallRk: 2 }),
  ];
  const catalog = buildDraftPlayerCatalog({
    players,
    contracts: [],
    nhlTeams,
    selectedPlayerIds: [],
    latestStats: new Map([
      ["center", { G: "12" }],
      ["wing", { G: "20" }],
    ]),
  });
  const snapshot = structuredClone(catalog);
  const options = {
    searchTerm: "",
    positionFilter: "F",
    sortKey: "G" as const,
    sortDirection: "desc" as const,
  };
  assert.deepEqual(
    filterDraftPlayerCatalog(catalog, options).map((row) => row.id),
    ["wing", "center"],
  );
  assert.deepEqual(
    filterDraftPlayerCatalog(catalog, { ...options, positionFilter: "C" }).map(
      (row) => row.id,
    ),
    ["center"],
  );
  assert.deepEqual(
    filterDraftPlayerCatalog(catalog, { ...options, searchTerm: " njD " }).map(
      (row) => row.id,
    ),
    ["wing"],
  );
  assert.deepEqual(
    filterDraftPlayerCatalog(catalog, { ...options, searchTerm: "CENTER" }).map(
      (row) => row.id,
    ),
    ["center"],
  );
  assert.deepEqual(
    filterDraftPlayerCatalog(catalog, { ...options, searchTerm: "LW" }).map(
      (row) => row.id,
    ),
    ["wing"],
  );
  assert.deepEqual(
    filterDraftPlayerCatalog(catalog, { ...options, positionFilter: "G" }).map(
      (row) => row.id,
    ),
    ["goalie"],
  );
  assert.deepEqual(
    filterDraftPlayerCatalog(catalog, {
      ...options,
      positionFilter: "all",
      sortKey: "overallRk",
      sortDirection: "asc",
    }).map((row) => row.id),
    ["wing", "goalie", "center"],
  );
  assert.deepEqual(catalog, snapshot);
});

void test("explicit hub and roster pick adapters produce the same catalog membership", () => {
  const hubPicks = [{ player: { id: "taken" } }, { player: null }];
  const rosterPicks = [{ playerId: "taken" }, { playerId: null }];
  const input = {
    players: [player("taken"), player("free")],
    contracts: [],
    nhlTeams: [],
    latestStats: new Map(),
  };
  const hub = buildDraftPlayerCatalog({
    ...input,
    selectedPlayerIds: hubPicks.flatMap((pick) =>
      pick.player ? [pick.player.id] : [],
    ),
  });
  const roster = buildDraftPlayerCatalog({
    ...input,
    selectedPlayerIds: rosterPicks.flatMap((pick) =>
      pick.playerId ? [pick.playerId] : [],
    ),
  });
  assert.deepEqual(hub, roster);
  assert.deepEqual(
    hub.map((row) => row.id),
    ["free"],
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildNormalizedNhlRosters } from "./normalized-nhl-rosters";
import type { NhlRosterAnalyticsPlayer } from "../../types/nhl-contract-analytics";

const teams = [
  { id: "tor", name: "Toronto", abbr: "TOR" },
  { id: "nj", name: "New Jersey", abbr: "NJD" },
];
const caps = { 2025: 50_000_000, 2026: 100_000_000, 2027: 200_000_000 };
const player: NhlRosterAnalyticsPlayer = {
  id: "p",
  playerName: "Player",
  position: "F",
  nhlTeam: ["TOR"],
  historyTruncated: false,
  contracts: [
    {
      id: "c",
      playerName: "Player",
      position: "F",
      signingDate: 0,
      startSeasonStartYear: 2025,
      expirySeasonStartYear: 2026,
      length: 2,
      seasons: [
        { seasonStartYear: 2025, capHit: 10_000_000 },
        { seasonStartYear: 2026, capHit: 10_000_000 },
      ],
    },
  ],
};
void test("future commitments drop expired deals, select extensions and retain teams with zero commitments", () => {
  const extension = {
    ...player.contracts[0]!,
    id: "extension",
    startSeasonStartYear: 2027,
    expirySeasonStartYear: 2027,
    length: 1,
    seasons: [{ seasonStartYear: 2027, capHit: 20_000_000 }],
  };
  const result = buildNormalizedNhlRosters(
    teams,
    [
      { ...player, contracts: [...player.contracts, extension] },
      { ...player, id: "expired", nhlTeam: ["NJD"] },
    ],
    2027,
    caps,
    "future",
  );
  const tor = result.find((team) => team.id === "tor")!;
  assert.equal(tor.normalizedTotal, 10_000_000);
  assert.equal(tor.roster[0]?.contract?.id, "extension");
  const nj = result.find((team) => team.id === "nj")!;
  assert.equal(nj.roster.length, 0);
  assert.equal(nj.normalizedTotal, 0);
});
void test("historical mode uses recorded contract history rather than a later profile observation", () => {
  const result = buildNormalizedNhlRosters(
    teams,
    [
      {
        ...player,
        currentProfileContract: {
          ...player.contracts[0]!,
          signingDate: 2,
          seasons: [{ seasonStartYear: 2026, capHit: 900_000 }],
        },
      },
    ],
    2026,
    caps,
    "historical",
  );
  assert.equal(result[0]?.normalizedTotal, 15_000_000);
  assert.equal(result[0]?.roster[0]?.usesProfileContract, false);
});

void test("Phoenix historical assignments resolve to the Coyotes without changing other franchises", () => {
  const result = buildNormalizedNhlRosters(
    [{ id: "ari", name: "Arizona Coyotes", abbr: "ARI" }],
    [
      {
        ...player,
        nhlTeam: ["PHX"],
        contracts: [
          {
            ...player.contracts[0]!,
            startSeasonStartYear: 2013,
            expirySeasonStartYear: 2013,
            length: 1,
            seasons: [{ seasonStartYear: 2013, capHit: 1_000_000 }],
          },
        ],
      },
    ],
    2013,
    { 2013: 64_300_000 },
    "historical",
  );
  assert.equal(result[0]?.name, "Phoenix Coyotes");
  assert.equal(result[0]?.roster[0]?.reason, null);
});
void test("sums full-contract normalization once per current player and ignores future extensions", () => {
  const extension = {
    ...player.contracts[0]!,
    id: "future",
    startSeasonStartYear: 2027,
    expirySeasonStartYear: 2027,
    length: 1,
    seasons: [{ seasonStartYear: 2027, capHit: 20_000_000 }],
  };
  const input = [
    { ...player, contracts: [...player.contracts, extension] },
    player,
  ];
  const before = JSON.stringify(input);
  const result = buildNormalizedNhlRosters(teams, input, 2026, caps)[0]!;
  assert.equal(result.roster.length, 1);
  assert.equal(result.normalizedTotal, 15_000_000);
  assert.equal(result.capHitTotal, 10_000_000);
  assert.equal(result.complete, true);
  assert.equal(JSON.stringify(input), before);
});
void test("missing and overlapping contracts remain visible with partial totals", () => {
  const result = buildNormalizedNhlRosters(
    teams,
    [
      player,
      { ...player, id: "missing", contracts: [] },
      {
        ...player,
        id: "overlap",
        contracts: [
          ...player.contracts,
          { ...player.contracts[0]!, id: "conflict" },
        ],
      },
    ],
    2026,
    caps,
  )[0]!;
  assert.equal(result.normalizedTotal, 15_000_000);
  assert.equal(result.missing, 2);
  assert.equal(result.complete, false);
  assert.equal(result.roster.length, 3);
  assert.equal(result.calculatedPlayers, 1);
});
void test("team aliases resolve while ambiguous assignments are never counted twice", () => {
  const result = buildNormalizedNhlRosters(
    teams,
    [
      { ...player, nhlTeam: ["NJ"] },
      { ...player, id: "ambiguous", nhlTeam: ["TOR/NJD"] },
    ],
    2026,
    caps,
  );
  assert.equal(result.find((team) => team.id === "nj")?.roster.length, 1);
  assert.equal(
    result.find((team) => team.id === "tor"),
    undefined,
  );
  assert.equal(
    result.find((team) => team.id === "unassigned")?.roster.length,
    1,
  );
});

void test("catalog aliases form one team and empty historical entries are excluded", () => {
  const result = buildNormalizedNhlRosters(
    [
      ...teams,
      { id: "alias", name: "New Jersey", abbr: "NJ" },
      { id: "old", name: "Historical team", abbr: "OLD" },
    ],
    [{ ...player, nhlTeam: ["NJ"] }],
    2026,
    caps,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "nj");
  assert.equal(result[0]?.normalizedTotal, 15_000_000);
});
void test("cap edits recalculate team totals and missing caps make totals incomplete", () => {
  assert.equal(
    buildNormalizedNhlRosters(teams, [player], 2026, {
      2025: 100_000_000,
      2026: 100_000_000,
    })[0]?.normalizedTotal,
    10_000_000,
  );
  const result = buildNormalizedNhlRosters(teams, [player], 2026, {
    2026: 100_000_000,
  }).find((team) => team.id === "tor")!;
  assert.equal(result.complete, false);
  assert.equal(result.missing, 1);
  assert.equal(result.normalizedTotal, 0);
});

void test("a complete current profile supplies a missing signing, including Holl's one-year deal", () => {
  const profile = {
    ...player.contracts[0]!,
    id: "profile:p",
    startSeasonStartYear: 2026,
    expirySeasonStartYear: 2026,
    length: 1,
    signingDate: Date.UTC(2026, 6, 1),
    seasons: [{ seasonStartYear: 2026, capHit: 900_000 }],
  };
  const result = buildNormalizedNhlRosters(
    teams,
    [{ ...player, contracts: [], currentProfileContract: profile }],
    2026,
    { 2026: 104_000_000 },
  )[0]!;
  assert.equal(result.complete, true);
  assert.equal(result.normalizedTotal, (900_000 / 104_000_000) * 100_000_000);
  assert.equal(result.roster[0]?.usesProfileContract, true);
});

void test("the profile's signing identity selects the current deal without deleting overlapping history", () => {
  const current = {
    ...player.contracts[0]!,
    id: "new",
    signingDate: Date.UTC(2026, 8, 12),
    startSeasonStartYear: 2026,
    expirySeasonStartYear: 2026,
    length: 1,
    seasons: [{ seasonStartYear: 2026, capHit: 2_150_000 }],
  };
  const result = buildNormalizedNhlRosters(
    teams,
    [
      {
        ...player,
        contracts: [...player.contracts, current],
        currentProfileContract: { ...current, id: "profile:p" },
      },
    ],
    2026,
    { 2026: 104_000_000 },
  )[0]!;
  assert.equal(result.roster[0]?.contract?.id, "new");
  assert.equal(result.roster[0]?.reason, null);
  assert.equal(result.roster[0]?.usesProfileContract, false);
});

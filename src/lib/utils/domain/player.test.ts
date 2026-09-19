import assert from "node:assert/strict";
import test from "node:test";
import type { NHLTeam } from "@gshl-types";
import {
  findNhlTeamByAbbreviation,
  getPlayerNhlAbbreviations,
  resolveNhlTeamLogoUrl,
} from "./player";

const teams: NHLTeam[] = [
  {
    id: "tor",
    name: "Toronto Maple Leafs",
    abbr: "TOR",
    logoUrl: "https://example.com/tor.svg",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  {
    id: "njd",
    name: "New Jersey Devils",
    abbr: "NJD",
    logoUrl: "https://example.com/njd.svg",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
];

void test("findNhlTeamByAbbreviation resolves the stored abbr field", () => {
  assert.equal(findNhlTeamByAbbreviation(teams, "TOR"), teams[0]);
});

void test("findNhlTeamByAbbreviation normalizes player team values", () => {
  assert.equal(findNhlTeamByAbbreviation(teams, " njd "), teams[1]);
  assert.equal(findNhlTeamByAbbreviation(teams, ["tor"]), teams[0]);
});

void test("resolveNhlTeamLogoUrl uses permanent local assets", () => {
  assert.equal(
    resolveNhlTeamLogoUrl(teams[0]!),
    "/nhl-logos/toronto-maple-leafs.png",
  );
  assert.equal(
    resolveNhlTeamLogoUrl({ name: "NJD/CGY", logoUrl: "remote.png" }),
    "/nhl-logos/new-jersey-devils.png",
  );
});

void test("resolveNhlTeamLogoUrl preserves unknown remote logos", () => {
  assert.equal(
    resolveNhlTeamLogoUrl({ name: "Future NHL Team", logoUrl: "remote.png" }),
    "remote.png",
  );
});

void test("normalizes every duplicate NHL catalog abbreviation pair", () => {
  const pairs = [
    ["ANH", "ANA"],
    ["CAL", "CGY"],
    ["CLB", "CBJ"],
    ["LA", "LAK"],
    ["MON", "MTL"],
    ["NAS", "NSH"],
    ["NJ", "NJD"],
    ["SJ", "SJS"],
    ["TB", "TBL"],
    ["VEG", "VGK"],
    ["WAS", "WSH"],
    ["WIN", "WPG"],
    ["ARZ", "ARI"],
    ["CLS", "CBJ"],
    ["NASH", "NSH"],
    ["UTAH", "UTA"],
  ];
  for (const [alias, canonical] of pairs) {
    assert.deepEqual(getPlayerNhlAbbreviations(`${alias}/${canonical}`), [
      canonical,
    ]);
  }
  assert.deepEqual(
    getPlayerNhlAbbreviations([" nj / NJD", "VEG", "vgk", "TOR"]),
    ["NJD", "VGK", "TOR"],
  );
  assert.deepEqual(getPlayerNhlAbbreviations(["ARI", "UTA", "WPG", "ATL"]), [
    "ARI",
    "UTA",
    "WPG",
    "ATL",
  ]);
});

void test("prefers canonical catalog entries and falls back to alias-only catalogs", () => {
  const alias = { abbr: "NJ" };
  const canonical = { abbr: "NJD" };
  assert.equal(findNhlTeamByAbbreviation([alias, canonical], "NJ"), canonical);
  assert.equal(findNhlTeamByAbbreviation([alias], "NJD"), alias);
  assert.equal(findNhlTeamByAbbreviation([canonical], " nj "), canonical);
});

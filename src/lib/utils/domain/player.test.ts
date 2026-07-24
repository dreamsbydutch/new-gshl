import assert from "node:assert/strict";
import test from "node:test";
import type { NHLTeam } from "@gshl-types";
import { findNhlTeamByAbbreviation } from "./player";

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

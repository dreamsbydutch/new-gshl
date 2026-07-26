import assert from "node:assert/strict";
import test from "node:test";

import type { GSHLTeam, Season, TeamAward } from "@gshl-types";
import { AwardsList } from "../domain/constants";
import {
  buildTrophyCaseData,
  buildTrophyCupShowcaseLayout,
  formatYearRanges,
} from "./trophy-case";

const now = new Date(0);

function season(id: string, year: number): Season {
  return {
    id,
    year,
    name: String(year),
    categories: [],
    rosterSpots: [],
    startDate: "",
    endDate: "",
    isActive: false,
    usesLegacyTies: false,
    signingEndDate: "",
    createdAt: now,
    updatedAt: now,
  };
}

function award(
  id: string,
  seasonId: string,
  awardKey: TeamAward["award"],
): TeamAward {
  return {
    id,
    seasonId,
    ownerId: "owner-1",
    nomineeIds: [],
    award: awardKey,
    createdAt: now,
    updatedAt: now,
  };
}

const currentTeam: GSHLTeam = {
  id: "team-1",
  seasonId: "season-3",
  franchiseId: "franchise-1",
  name: "Test Team",
  abbr: "TST",
  logoUrl: "/test-logo.png",
  isActive: true,
  yahooId: null,
  confId: null,
  confName: null,
  confAbbr: null,
  confLogoUrl: null,
  ownerId: "owner-1",
  ownerFirstName: "Test",
  ownerLastName: "Owner",
  ownerNickname: null,
  ownerEmail: null,
  ownerOwing: null,
  ownerIsActive: true,
};

void test("formats consecutive trophy seasons as compact ranges", () => {
  assert.equal(formatYearRanges([2024, 2022, 2021, 2024]), "2021-22, 2024");
});

void test("places newest cups in the prominent center positions", () => {
  const fourCupLayout = buildTrophyCupShowcaseLayout(4);
  assert.deepEqual(
    fourCupLayout.positions.map((position) => position.slotIndex),
    [1, 2, 0, 3],
  );
  assert.ok(
    fourCupLayout.positions[0]!.zIndex > fourCupLayout.positions[2]!.zIndex,
  );

  const fiveCupLayout = buildTrophyCupShowcaseLayout(5);
  assert.deepEqual(
    fiveCupLayout.positions.map((position) => position.slotIndex),
    [2, 1, 3, 0, 4],
  );
  assert.equal(fiveCupLayout.positions[0]?.scale, 1);
  assert.equal(fiveCupLayout.positions[0]?.translateY, 16);
  assert.equal(fiveCupLayout.positions[3]?.scale, 0.84);
});

void test("groups trophy wins by award with count and season range metadata", () => {
  const result = buildTrophyCaseData({
    teamAwards: [
      award("cup-2022", "season-2", AwardsList.GSHL_CUP),
      award("hart-2024", "season-3", AwardsList.HART),
      award("cup-2021", "season-1", AwardsList.GSHL_CUP),
    ],
    allTeams: [currentTeam],
    currentTeam,
    seasons: [
      season("season-1", 2021),
      season("season-2", 2022),
      season("season-3", 2024),
    ],
  });

  assert.deepEqual(
    result.awardSections.map((section) => section.awardKey),
    [AwardsList.GSHL_CUP, AwardsList.HART],
  );
  assert.equal(result.awardSections[0]?.winnerLabel, "2-time winner");
  assert.equal(result.awardSections[0]?.seasonRange, "2021-22");
  assert.deepEqual(
    result.awardSections[0]?.cards.map((card) => card.seasonYear),
    [2022, 2021],
  );
});

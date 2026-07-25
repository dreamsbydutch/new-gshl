import assert from "node:assert/strict";
import test from "node:test";

import type { Player, PlayerAward } from "@gshl-types";
import { AwardsList, PositionGroup } from "../domain/constants";
import { buildPlayerAwardSections } from "./season-awards";

function player(): Player {
  return {
    id: "player-1",
    firstName: "Alex",
    lastName: "Example",
    fullName: "Alex Example",
    nhlPos: ["C"],
    posGroup: PositionGroup.F,
    nhlTeam: "TOR",
    isActive: true,
    isSignable: true,
    isResignable: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function award(id: string, awardKey: PlayerAward["award"]): PlayerAward {
  return {
    id,
    seasonId: "season-1",
    playerId: "player-1",
    nomineeIds: [],
    award: awardKey,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

void test("groups every non-all-star player award for the standings awards page", () => {
  const sections = buildPlayerAwardSections(
    [
      award("crosby", AwardsList.CROSBY),
      award("gretzky", AwardsList.GRETZKY),
      award("first-star", AwardsList.FIRST_AS),
    ],
    [player()],
    [],
    [],
  );

  assert.deepEqual(
    sections.map((section) => section.awardKey),
    [AwardsList.CROSBY, AwardsList.GRETZKY],
  );
  assert.equal(sections[0]?.winners[0]?.playerName, "Alex Example");
  assert.equal(sections[0]?.iconUrl !== null, true);
});

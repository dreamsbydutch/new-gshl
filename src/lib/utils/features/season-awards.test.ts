import assert from "node:assert/strict";
import test from "node:test";

import type { Player, PlayerAward } from "@gshl-types";
import { AwardsList, PositionGroup } from "../domain/constants";
import {
  buildAllStarTeamCards,
  buildPlayerAwardSections,
} from "./season-awards";

function player(
  id = "player-1",
  fullName = "Alex Example",
  nhlPos: Player["nhlPos"] = ["C"],
): Player {
  return {
    id,
    firstName: "Alex",
    lastName: "Example",
    fullName,
    nhlPos,
    posGroup: PositionGroup.F,
    nhlTeam: "TOR",
    isActive: true,
    isSignable: true,
    isResignable: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function award(
  id: string,
  awardKey: PlayerAward["award"],
  playerId = "player-1",
): PlayerAward {
  return {
    id,
    seasonId: "season-1",
    playerId,
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
      award("conn-smythe", AwardsList.CONN_SMYTHE),
      award("first-star", AwardsList.FIRST_AS),
      award("playoff-star", AwardsList.PLAYOFF_AS),
    ],
    [player()],
    [],
    [],
  );

  assert.deepEqual(
    sections.map((section) => section.awardKey),
    [AwardsList.CROSBY, AwardsList.GRETZKY, AwardsList.CONN_SMYTHE],
  );
  assert.equal(sections[0]?.winners[0]?.playerName, "Alex Example");
  assert.equal(sections[0]?.iconUrl !== null, true);
  assert.equal(sections[2]?.title, "Conn Smythe Trophy");
});

void test("sorts all-star winners by lineup position", () => {
  const players = [
    player("goalie", "Goalie", ["G"]),
    player("right-wing", "Right Wing", ["RW"]),
    player("center", "Center", ["C"]),
    player("defense-two", "Defense Two", ["D"]),
    player("left-wing", "Left Wing", ["LW"]),
    player("defense-one", "Defense One", ["D"]),
  ];
  const cards = buildAllStarTeamCards(
    players.map((currentPlayer) =>
      award(
        `${currentPlayer.id}-award`,
        AwardsList.FIRST_AS,
        String(currentPlayer.id),
      ),
    ),
    players,
    [],
    [],
  );
  const firstTeam = cards[0];

  assert.ok(firstTeam);
  assert.deepEqual(
    firstTeam.winners.map((winner) => winner.playerName),
    [
      "Center",
      "Left Wing",
      "Right Wing",
      "Defense One",
      "Defense Two",
      "Goalie",
    ],
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import type { GSHLTeam, Player, PlayerAward, TeamAward } from "@gshl-types";
import { AwardsList, PositionGroup } from "../domain/constants";
import {
  buildAllStarTeamCards,
  buildPlayerAwardSections,
  buildSeasonAwardCards,
  isSeasonAwardsInProgress,
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
  nomineeIds: string[] = [],
): PlayerAward {
  return {
    id,
    seasonId: "season-1",
    playerId,
    nomineeIds,
    award: awardKey,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function team(id: string, ownerId: string, name: string): GSHLTeam {
  return {
    id,
    seasonId: "season-1",
    franchiseId: `franchise-${id}`,
    name,
    abbr: name.slice(0, 3),
    logoUrl: null,
    isActive: true,
    yahooId: null,
    confId: "conference-1",
    confName: "Conference",
    confAbbr: "C",
    confLogoUrl: null,
    ownerId,
    ownerFirstName: ownerId,
    ownerLastName: "Owner",
    ownerNickname: null,
    ownerEmail: null,
    ownerOwing: 0,
    ownerIsActive: true,
  };
}

void test("groups every non-all-star player award for the standings awards page", () => {
  const sections = buildPlayerAwardSections(
    [
      award("crosby", AwardsList.CROSBY, "player-1", ["player-2", "player-3"]),
      award("gretzky", AwardsList.GRETZKY),
      award("conn-smythe", AwardsList.CONN_SMYTHE),
      award("first-star", AwardsList.FIRST_AS),
      award("playoff-star", AwardsList.PLAYOFF_AS),
    ],
    [
      player(),
      player("player-2", "Blake Finalist"),
      player("player-3", "Casey Finalist"),
    ],
    [],
    [],
  );

  assert.deepEqual(
    sections.map((section) => section.awardKey),
    [AwardsList.CROSBY, AwardsList.GRETZKY, AwardsList.CONN_SMYTHE],
  );
  assert.equal(sections[0]?.winners[0]?.playerName, "Alex Example");
  assert.deepEqual(sections[0]?.winners[0]?.nomineeNames, [
    "Blake Finalist",
    "Casey Finalist",
  ]);
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

void test("resolves team award nominees for the standings awards page", () => {
  const teamAward: TeamAward = {
    id: "rocket-award",
    seasonId: "season-1",
    ownerId: "owner-1",
    nomineeIds: ["owner-2", "owner-3"],
    award: AwardsList.ROCKET,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const cards = buildSeasonAwardCards(
    [teamAward],
    [
      team("team-1", "owner-1", "Winning Team"),
      team("team-2", "owner-2", "Second Team"),
      team("team-3", "owner-3", "Third Team"),
    ],
  );

  assert.deepEqual(cards[0]?.nomineeNames, ["Second Team", "Third Team"]);
});

void test("uses the contender view through the season end date", () => {
  assert.equal(
    isSeasonAwardsInProgress(
      { endDate: "2026-07-25" },
      new Date(2026, 6, 25, 12),
    ),
    true,
  );
  assert.equal(
    isSeasonAwardsInProgress(
      { endDate: "2026-07-25" },
      new Date(2026, 6, 26, 12),
    ),
    false,
  );
});

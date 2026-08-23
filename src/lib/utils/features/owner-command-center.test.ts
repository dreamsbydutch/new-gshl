import assert from "node:assert/strict";
import test from "node:test";

import type { OwnerCommandCenterData } from "@gshl-lib/types/owner-command-center";
import {
  buildOwnerCommandCenterView,
  countUnreadOwnerActivity,
  newestOwnerActivityAt,
  ownerCommandCenterActivityStorageKey,
} from "./owner-command-center";

const data: OwnerCommandCenterData = {
  ownerId: "owner-1",
  ownerName: "Alex Owner",
  season: {
    id: "season-2026",
    year: 2026,
    name: "2025-26",
    rosterSpots: [
      "LW",
      "C",
      "RW",
      "D",
      "D",
      "LW",
      "C",
      "RW",
      "D",
      "G",
      "Util",
      "BN",
      "BN",
      "BN",
      "BN",
    ],
    startDate: "2025-09-01",
    endDate: "2026-04-20",
    signingEndDate: "2026-08-01",
    isActive: true,
  },
  seasons: [
    {
      id: "season-2026",
      year: 2026,
      name: "2025-26",
      rosterSpots: [],
      startDate: "2025-09-01",
      endDate: "2026-04-20",
      signingEndDate: "2026-08-01",
      isActive: true,
    },
    {
      id: "season-2027",
      year: 2027,
      name: "2026-27",
      rosterSpots: [],
      startDate: "2026-09-01",
      endDate: "2027-04-20",
      signingEndDate: "2027-08-01",
      isActive: false,
    },
    {
      id: "season-2028",
      year: 2028,
      name: "2027-28",
      rosterSpots: [],
      startDate: "2027-09-01",
      endDate: "2028-04-20",
      signingEndDate: "2028-08-01",
      isActive: false,
    },
  ],
  team: {
    id: "team-1",
    name: "Gemstones",
    abbr: "GEM",
    logoUrl: null,
  },
  roster: [
    {
      id: "player-1",
      fullName: "Center One",
      nhlPos: ["C"],
      posGroup: "F",
      nhlTeam: ["TOR"],
      lineupPos: "C",
      overallRating: 80,
    },
    {
      id: "player-2",
      fullName: "Defender One",
      nhlPos: ["D"],
      posGroup: "D",
      nhlTeam: ["MTL"],
      lineupPos: "D",
      overallRating: 75,
    },
    {
      id: "player-3",
      fullName: "Goalie One",
      nhlPos: ["G"],
      posGroup: "G",
      nhlTeam: ["OTT"],
      lineupPos: "G",
      overallRating: 70,
    },
  ],
  contracts: [
    {
      id: "contract-1",
      playerId: "player-1",
      ownerId: "owner-1",
      seasonId: "season-2026",
      contractType: "STANDARD",
      contractLength: 2,
      contractSalary: 5_000_000,
      signingDate: "2025-07-01",
      startDate: "2025-09-01",
      signingStatus: "Drafted",
      expiryStatus: "UFA",
      expiryDate: "2027-04-20",
      capHit: 5_000_000,
      capHitEndDate: "2027-04-20",
    },
  ],
  draftPicks: [
    {
      id: "pick-1",
      seasonId: "season-2027",
      seasonName: "2026-27",
      round: "1",
      pick: "3",
      isTraded: true,
      originalTeamId: "team-2",
    },
    {
      id: "pick-2",
      seasonId: "season-2027",
      seasonName: "2026-27",
      round: "2",
      pick: "18",
      isTraded: false,
      originalTeamId: "team-1",
    },
  ],
  pendingOffers: [
    {
      id: "offer-1",
      playerId: "free-agent-1",
      playerName: "Free Agent",
      seasonId: "season-2026",
      contractLength: 2,
      salary: 2_000_000,
      deadlineAt: "2026-08-28T12:00:00.000Z",
      groupStatus: "open",
    },
  ],
  listedPlayers: [
    {
      listingId: "listing-own",
      playerId: "player-2",
      playerName: "Defender One",
      note: "Looking for a pick",
      updatedAt: "2026-08-20T12:00:00.000Z",
    },
  ],
  nextMatchup: {
    id: "matchup-next",
    weekId: "week-2",
    weekNum: 2,
    weekStartDate: "2026-10-08",
    weekEndDate: "2026-10-14",
    gameType: "NC",
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    homeScore: null,
    awayScore: null,
    homeWin: null,
    awayWin: null,
    tie: null,
    opponent: {
      id: "team-2",
      name: "Rivals",
      abbr: "RIV",
      logoUrl: null,
    },
  },
  recentMatchups: [
    {
      id: "matchup-last",
      weekId: "week-1",
      weekNum: 1,
      weekStartDate: "2026-10-01",
      weekEndDate: "2026-10-07",
      gameType: "NC",
      homeTeamId: "team-2",
      awayTeamId: "team-1",
      homeScore: 4,
      awayScore: 6,
      homeWin: false,
      awayWin: true,
      tie: false,
      opponent: {
        id: "team-2",
        name: "Rivals",
        abbr: "RIV",
        logoUrl: null,
      },
    },
  ],
  tradeActivity: [
    {
      id: "trade-listing-2",
      listingId: "listing-2",
      playerName: "Trade Target",
      teamName: "Rivals",
      occurredAt: "2026-08-22T12:00:00.000Z",
    },
  ],
};

void test("owner command center combines roster, cap, schedule, picks, and decisions", () => {
  const view = buildOwnerCommandCenterView(data);

  assert.equal(view.roster.count, 3);
  assert.equal(view.roster.capacity, 15);
  assert.deepEqual(
    view.roster.gaps.map((gap) => [gap.position, gap.missing]),
    [
      ["LW", 2],
      ["C", 1],
      ["RW", 2],
      ["D", 2],
      ["Util", 1],
    ],
  );
  assert.equal(view.cap[0]?.remaining, 20_000_000);
  assert.equal(view.cap[1]?.remaining, 18_000_000);
  assert.equal(view.cap[1]?.reserved, 2_000_000);
  assert.equal(view.contractDecisions[0]?.playerName, "Center One");
  assert.equal(view.matchup.record.wins, 1);
  assert.match(view.matchup.href, /matchup\/matchup-next/);
  assert.match(view.matchup.href, /from=lockerroom/);
  assert.equal(view.draft.count, 2);
  assert.equal(view.draft.acquired, 1);
  assert.deepEqual(
    view.draft.groups[0]?.rounds.map((round) => [round.round, round.count]),
    [
      ["1", 1],
      ["2", 1],
    ],
  );
  assert.equal(view.offers[0]?.playerName, "Free Agent");
  assert.equal(view.listedPlayers[0]?.playerName, "Defender One");
  assert.deepEqual(
    view.activity.map((item) => item.kind),
    ["trade"],
  );
});

void test("owner activity uses a stable per-owner unread marker", () => {
  const view = buildOwnerCommandCenterView(data);

  assert.equal(
    countUnreadOwnerActivity(view.activity, "2026-08-21T18:00:00.000Z"),
    1,
  );
  assert.equal(
    newestOwnerActivityAt(view.activity),
    "2026-08-22T12:00:00.000Z",
  );
  assert.equal(
    ownerCommandCenterActivityStorageKey("owner-1"),
    "gshl-owner-command-center-activity:owner-1",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileCurrentRoster,
  resolveRosterCalendar,
  type RosterSeason,
  type RosterSource,
} from "./player-roster";

const seasons: RosterSeason[] = [
  {
    id: "season-2026",
    year: 2026,
    startDate: "2025-10-07",
    endDate: "2026-04-19",
    signingEndDate: "2026-06-26",
  },
  {
    id: "season-2027",
    year: 2027,
    startDate: "2026-10-07",
    endDate: "2027-04-19",
    signingEndDate: "2027-06-26",
    draftStartAt: "2026-09-18T19:00:00.000Z",
  },
  {
    id: "season-2028",
    year: 2028,
    startDate: "2027-10-07",
    endDate: "2028-04-19",
    signingEndDate: "2028-06-26",
  },
];

const teams = [
  {
    id: "team-a-2026",
    seasonId: "season-2026",
    franchiseId: "franchise-a",
  },
  {
    id: "team-a-2027",
    seasonId: "season-2027",
    franchiseId: "franchise-a",
  },
  {
    id: "team-b-2027",
    seasonId: "season-2027",
    franchiseId: "franchise-b",
  },
];

const franchises = [
  { id: "franchise-a", ownerId: "owner-a" },
  { id: "franchise-b", ownerId: "owner-b" },
];

function referenceDate(value: string): Date {
  return new Date(`${value}T16:00:00.000Z`);
}

test("resolves in-season, signing, contract-only, and post-draft windows", () => {
  assert.deepEqual(
    resolveRosterCalendar(seasons, referenceDate("2026-02-02")),
    {
      phase: "inSeason",
      referenceDate: "2026-02-02",
      previousDate: "2026-02-01",
      rosterSeasonId: "season-2026",
      playerDaySeasonId: "season-2026",
      targetTeamSeasonId: "season-2026",
      seasonEndDate: "2026-04-19",
      draftDate: "",
    },
  );
  assert.equal(
    resolveRosterCalendar(seasons, referenceDate("2026-06-26")).phase,
    "signingPeriod",
  );
  assert.deepEqual(
    resolveRosterCalendar(seasons, referenceDate("2026-07-26")),
    {
      phase: "offseasonContracts",
      referenceDate: "2026-07-26",
      previousDate: "2026-07-25",
      rosterSeasonId: "season-2027",
      playerDaySeasonId: "",
      targetTeamSeasonId: "season-2027",
      seasonEndDate: "2027-04-19",
      draftDate: "2026-09-18",
    },
  );
  assert.equal(
    resolveRosterCalendar(seasons, referenceDate("2026-09-18")).phase,
    "postDraft",
  );
});

test("uses a dated player roster and clears team and lineup for everyone absent", () => {
  const calendar = resolveRosterCalendar(seasons, referenceDate("2026-02-02"));
  const source: RosterSource = {
    kind: "playerDayCurrent",
    date: "2026-02-02",
    playerDays: [
      {
        playerId: "player-1",
        gshlTeamId: "team-a-2026",
        date: "2026-02-02",
      },
    ],
  };
  const result = reconcileCurrentRoster({
    calendar,
    source,
    players: [
      {
        id: "player-1",
        fullName: "Roster Player",
        ownerId: null,
        lineupPos: null,
      },
      {
        id: "player-2",
        fullName: "Dropped Player",
        ownerId: "owner-a",
        gshlTeamId: "team-a-2026",
        lineupPos: "C",
      },
      {
        id: "player-3",
        fullName: "Stale Lineup Player",
        ownerId: null,
        lineupPos: "BN",
      },
    ],
    seasons,
    contracts: [],
    teams,
    franchises,
    draftPicks: [],
  });

  assert.equal(result.rosteredPlayers, 1);
  assert.equal(result.assignedPlayers, 1);
  assert.equal(result.clearedPlayers, 1);
  assert.deepEqual(result.updates, [
    { id: "player-1", data: { ownerId: "owner-a" } },
    {
      id: "player-2",
      data: { ownerId: null, gshlTeamId: null, lineupPos: null },
    },
    { id: "player-3", data: { lineupPos: null } },
  ]);
  assert.equal(result.legacyTeamIdsCleared, 1);
});

test("after signing, maps playing contracts onto the upcoming season teams", () => {
  const calendar = resolveRosterCalendar(seasons, referenceDate("2026-07-26"));
  const source: RosterSource = {
    kind: "offseasonContracts",
    date: "2026-07-26",
    playerDays: [],
  };
  const result = reconcileCurrentRoster({
    calendar,
    source,
    players: [
      { id: "player-1", fullName: "Under Contract" },
      {
        id: "player-2",
        fullName: "Bought Out",
        ownerId: "owner-b",
        gshlTeamId: "team-b-2027",
        lineupPos: "BN",
      },
    ],
    seasons,
    contracts: [
      {
        id: "contract-1",
        playerId: "player-1",
        ownerId: "owner-a",
        seasonId: "season-2026",
        contractType: "STANDARD",
        contractLength: 1,
        signingDate: "2026-06-16",
        startDate: "2026-06-16",
        expiryDate: "2027-04-19",
        capHitEndDate: "2027-04-19",
        expiryStatus: "RFA",
      },
      {
        id: "contract-2",
        playerId: "player-2",
        ownerId: "owner-b",
        seasonId: "season-2026",
        contractType: "STANDARD",
        contractLength: 1,
        startDate: "2026-06-16",
        expiryDate: "2027-04-19",
        capHitEndDate: "2027-04-19",
        expiryStatus: "Buyout",
      },
    ],
    teams,
    franchises,
    draftPicks: [],
  });

  assert.equal(result.contractAssignments, 1);
  assert.deepEqual(result.updates, [
    { id: "player-1", data: { ownerId: "owner-a" } },
    {
      id: "player-2",
      data: { ownerId: null, gshlTeamId: null, lineupPos: null },
    },
  ]);
  assert.deepEqual(result.issues, []);
});

test("a newer applicable contract supersedes an overlapping historical owner", () => {
  const calendar = resolveRosterCalendar(seasons, referenceDate("2026-07-26"));
  const source: RosterSource = {
    kind: "offseasonContracts",
    date: "2026-07-26",
    playerDays: [],
  };
  const result = reconcileCurrentRoster({
    calendar,
    source,
    players: [{ id: "player-1", fullName: "Re-signed Player" }],
    seasons,
    contracts: [
      {
        id: "old-contract",
        playerId: "player-1",
        ownerId: "inactive-owner",
        seasonId: "season-2026",
        contractType: "STANDARD",
        signingDate: "2025-08-17",
        startDate: "2025-08-17",
        expiryDate: "2027-05-01",
        expiryStatus: "RFA",
      },
      {
        id: "new-contract",
        playerId: "player-1",
        ownerId: "owner-a",
        seasonId: "season-2027",
        contractType: "STANDARD",
        signingDate: "2026-06-16",
        startDate: "2026-06-16",
        expiryDate: "2027-04-19",
        expiryStatus: "RFA",
      },
    ],
    teams,
    franchises,
    draftPicks: [],
  });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.updates, [
    { id: "player-1", data: { ownerId: "owner-a" } },
  ]);
});

test("after the draft, adds assigned picks to the contracted roster", () => {
  const calendar = resolveRosterCalendar(seasons, referenceDate("2026-09-19"));
  const source: RosterSource = {
    kind: "postDraftContractsAndPicks",
    date: "2026-09-19",
    playerDays: [],
  };
  const result = reconcileCurrentRoster({
    calendar,
    source,
    players: [
      { id: "player-1", fullName: "Under Contract" },
      { id: "player-2", fullName: "Drafted Player" },
    ],
    seasons,
    contracts: [
      {
        playerId: "player-1",
        ownerId: "owner-a",
        seasonId: "season-2026",
        contractType: "EXTENSION",
        contractLength: 1,
        startDate: "2026-10-07",
        expiryDate: "2027-04-19",
        expiryStatus: "UFA",
      },
    ],
    teams,
    franchises,
    draftPicks: [
      {
        id: "pick-1",
        seasonId: "season-2027",
        gshlTeamId: "team-b-2027",
        playerId: "player-2",
      },
    ],
  });

  assert.equal(result.rosteredPlayers, 2);
  assert.equal(result.contractAssignments, 1);
  assert.equal(result.draftPickAssignments, 1);
  assert.deepEqual(
    result.updates.map((update) => update.data.ownerId),
    ["owner-a", "owner-b"],
  );
});

test("reports conflicting roster sources instead of choosing a team", () => {
  const calendar = resolveRosterCalendar(seasons, referenceDate("2026-09-19"));
  const source: RosterSource = {
    kind: "postDraftContractsAndPicks",
    date: "2026-09-19",
    playerDays: [],
  };
  const result = reconcileCurrentRoster({
    calendar,
    source,
    players: [{ id: "player-1", fullName: "Conflicted Player" }],
    seasons,
    contracts: [
      {
        playerId: "player-1",
        ownerId: "owner-a",
        contractType: "STANDARD",
        startDate: "2026-10-07",
        expiryDate: "2027-04-19",
        expiryStatus: "UFA",
      },
    ],
    teams,
    franchises,
    draftPicks: [
      {
        id: "pick-1",
        seasonId: "season-2027",
        gshlTeamId: "team-b-2027",
        playerId: "player-1",
      },
    ],
  });

  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]?.kind, "conflictingPlayerOwner");
});

test("keeps ownership stable when the owner's franchise and team are rebranded", () => {
  const calendar = resolveRosterCalendar(seasons, referenceDate("2026-07-26"));
  const result = reconcileCurrentRoster({
    calendar,
    source: {
      kind: "offseasonContracts",
      date: "2026-07-26",
      playerDays: [],
    },
    players: [
      {
        id: "player-1",
        fullName: "Carried Player",
        ownerId: "owner-a",
        gshlTeamId: "team-a-2026",
      },
    ],
    seasons,
    contracts: [
      {
        id: "contract-1",
        playerId: "player-1",
        ownerId: "owner-a",
        seasonId: "season-2026",
        contractType: "STANDARD",
        startDate: "2026-10-07",
        expiryDate: "2027-04-19",
        expiryStatus: "UFA",
      },
    ],
    teams: teams.map((team) =>
      team.id === "team-a-2027"
        ? { ...team, franchiseId: "rebranded-franchise-a" }
        : team,
    ),
    franchises: [
      ...franchises,
      { id: "rebranded-franchise-a", ownerId: "owner-a" },
    ],
    draftPicks: [],
  });

  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.assignments, [
    {
      playerId: "player-1",
      ownerId: "owner-a",
      teamId: "team-a-2027",
    },
  ]);
  assert.deepEqual(result.updates, [
    { id: "player-1", data: { gshlTeamId: null } },
  ]);
  assert.equal(result.changedOwners, 0);
});

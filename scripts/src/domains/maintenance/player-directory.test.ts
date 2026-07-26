import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalName,
  mapPuckPediaPlayer,
  reconcilePlayerDirectory,
  type DirectoryPlayer,
  type StoredPlayer,
} from "./player-directory";
import type { PlayerActivityEvidence } from "./player-activity";

const CURRENT_DATE = new Date("2026-07-26T00:00:00Z");

function sourcePlayer(
  overrides: Partial<DirectoryPlayer> = {},
): DirectoryPlayer {
  return {
    sourceId: "100",
    nhlApiId: "8480001",
    firstName: "Mikey",
    lastName: "Anderson",
    fullName: "Mikey Anderson",
    birthDate: "1999-05-25",
    country: "USA",
    handedness: "L",
    jerseyNum: 44,
    weight: 195,
    height: "6' 0",
    positions: ["D"],
    posGroup: "D",
    teamAbbr: "LAK",
    contractStatus: "cur",
    contractLength: 8,
    salary: 4_500_000,
    capHit: 4_125_000,
    clauses: "",
    contractStartYear: "2022",
    signingDate: "2021-09-08",
    signingAgent: "Pat Brisson",
    signingGm: "Rob Blake",
    signingStatus: "RFA",
    expiryYear: "2030",
    expiryStatus: "UFA",
    ...overrides,
  };
}

function storedPlayer(overrides: Partial<StoredPlayer> = {}): StoredPlayer {
  return {
    id: "player-1",
    legacyId: "1",
    firstName: "Michael",
    lastName: "Anderson",
    fullName: "Michael Anderson",
    birthday: "1999-05-25",
    nhlPos: ["D"],
    posGroup: "D",
    nhlTeam: ["LAK"],
    isActive: true,
    ...overrides,
  };
}

function activityEvidence(
  overrides: Partial<PlayerActivityEvidence> = {},
): PlayerActivityEvidence {
  return {
    evidenceComplete: true,
    currentSeasonId: "season-2026",
    currentSeasonYear: 2026,
    currentSeasonGames: 0,
    previousSeasonId: "season-2025",
    previousSeasonYear: 2025,
    previousSeasonGames: 0,
    ...overrides,
  };
}

test("canonicalName folds accents, punctuation, and special letters", () => {
  assert.equal(canonicalName("  Lukáš Dostál Jr. "), "lukas dostal jr");
  assert.equal(canonicalName("Mats Zuccarellø"), "mats zuccarello");
  assert.equal(canonicalName("Jean-Luc O’Connor"), "jean luc oconnor");
  assert.equal(canonicalName("J.J. Moser"), "jj moser");
});

test("maps current PuckPedia fields without stripping display-name accents", () => {
  const mapped = mapPuckPediaPlayer({
    p_id: "555",
    nhl_id: "8481111",
    p_fn: "Lukáš",
    p_ln: "Dostál",
    pos: "G",
    birthdate: "2000-06-22",
    country: "CZE",
    jersey: "1",
    wt: "190",
    ht: "74",
    team_url: "anaheim-ducks",
    ctype: "cur",
    len: "5",
    cap_hit: "6500000",
    sal_t: "7200000",
    clauses: "M-NTC",
    start: "2025-2026",
    sign_date: "2025-07-01",
    a_sign_fn: "J.P.",
    a_sign_ln: "Barry",
    gm_sign_fn: "Pat",
    gm_sign_ln: "Verbeek",
    sts_sign: "RFA",
    exp: "2029-2030",
    sts_exp: "UFA",
  });

  assert.ok(mapped);
  assert.equal(mapped.firstName, "Lukáš");
  assert.equal(mapped.lastName, "Dostál");
  assert.deepEqual(mapped.positions, ["G"]);
  assert.equal(mapped.posGroup, "G");
  assert.equal(mapped.teamAbbr, "ANA");
  assert.equal(mapped.height, "6' 2");
  assert.equal(mapped.weight, 190);
  assert.equal(mapped.handedness, "");
  assert.equal(mapped.salary, 7_200_000);
  assert.equal(mapped.capHit, 6_500_000);
  assert.equal(mapped.clauses, "M-NTC");
  assert.equal(mapped.signingDate, "2025-07-01");
  assert.equal(mapped.signingAgent, "J.P. Barry");
  assert.equal(mapped.signingGm, "Pat Verbeek");
});

test("matches accent variants instead of inserting a duplicate", () => {
  const existing = storedPlayer({
    nhlApiId: null,
    firstName: "Lukáš",
    lastName: "Dostál",
    fullName: "Lukáš Dostál",
    birthday: "2000-06-22",
    nhlPos: ["G"],
    posGroup: "G",
    nhlTeam: ["ANA"],
  });
  const source = sourcePlayer({
    nhlApiId: "8481606",
    firstName: "Lukas",
    lastName: "Dostal",
    fullName: "Lukas Dostal",
    birthDate: "2000-06-22",
    positions: ["G"],
    posGroup: "G",
    teamAbbr: "ANA",
  });

  const result = reconcilePlayerDirectory([existing], [source], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
  });

  assert.equal(result.inserts.length, 0);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0]?.id, existing.id);
  assert.equal(result.updates[0]?.reason, "exactName");
});

test("matches a unique nickname variant with compatible bio data", () => {
  const result = reconcilePlayerDirectory([storedPlayer()], [sourcePlayer()], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
  });

  assert.equal(result.inserts.length, 0);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0]?.reason, "aliasName");
  assert.equal(result.updates[0]?.data.nhlApiId, "8480001");
  assert.equal(result.updates[0]?.data.nhlSalary, 4_500_000);
  assert.equal(result.updates[0]?.data.nhlSigningDate, "2021-09-08");
  assert.equal(result.updates[0]?.data.nhlSigningAgent, "Pat Brisson");
  assert.equal(result.updates[0]?.data.nhlSigningGm, "Rob Blake");
});

test("clears stale managed fields when PuckPedia returns no current value", () => {
  const existing = storedPlayer({
    nhlApiId: "8480001",
    age: 27,
    jerseyNum: 99,
    country: "CAN",
    handedness: "R",
    weight: 225,
    height: "6' 5",
    nhlContractStatus: "cur",
    nhlContractLength: "8",
    nhlSalary: 9_000_000,
    nhlCapHit: 8_000_000,
    nhlClauses: "NMC",
    nhlStartYear: "2022",
    nhlSigningDate: "2021-09-08",
    nhlSigningAgent: "Old Agent",
    nhlSigningGm: "Old GM",
    nhlSigningStatus: "RFA",
    nhlExpiryYear: "2030",
    nhlExpiryStatus: "UFA",
  });
  const source = sourcePlayer({
    birthDate: "",
    country: "",
    handedness: "",
    jerseyNum: null,
    weight: null,
    height: "",
    teamAbbr: "",
    contractStatus: "",
    contractLength: null,
    salary: null,
    capHit: null,
    clauses: "",
    contractStartYear: "",
    signingDate: "",
    signingAgent: "",
    signingGm: "",
    signingStatus: "",
    expiryYear: "",
    expiryStatus: "",
  });

  const result = reconcilePlayerDirectory([existing], [source], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
  });

  assert.equal(result.updates.length, 1);
  assert.deepEqual(result.updates[0]?.data.nhlTeam, []);
  assert.equal(result.updates[0]?.data.jerseyNum, null);
  assert.equal(result.updates[0]?.data.birthday, null);
  assert.equal(result.updates[0]?.data.age, null);
  assert.equal(result.updates[0]?.data.country, null);
  assert.equal(result.updates[0]?.data.handedness, null);
  assert.equal(result.updates[0]?.data.weight, null);
  assert.equal(result.updates[0]?.data.height, null);
  assert.equal(result.updates[0]?.data.nhlContractStatus, null);
  assert.equal(result.updates[0]?.data.nhlContractLength, null);
  assert.equal(result.updates[0]?.data.nhlSalary, null);
  assert.equal(result.updates[0]?.data.nhlCapHit, null);
  assert.equal(result.updates[0]?.data.nhlClauses, null);
  assert.equal(result.updates[0]?.data.nhlStartYear, null);
  assert.equal(result.updates[0]?.data.nhlSigningDate, null);
  assert.equal(result.updates[0]?.data.nhlSigningAgent, null);
  assert.equal(result.updates[0]?.data.nhlSigningGm, null);
  assert.equal(result.updates[0]?.data.nhlSigningStatus, null);
  assert.equal(result.updates[0]?.data.nhlExpiryYear, null);
  assert.equal(result.updates[0]?.data.nhlExpiryStatus, null);
});

test("does not emit an update when every managed value is current", () => {
  const source = sourcePlayer();
  const inserted = reconcilePlayerDirectory([], [source], {
    currentDate: CURRENT_DATE,
    deactivateMissing: false,
  }).inserts[0];
  assert.ok(inserted);

  const result = reconcilePlayerDirectory(
    [{ id: "current-player", ...inserted }],
    [source],
    {
      currentDate: CURRENT_DATE,
      deactivateMissing: false,
    },
  );

  assert.equal(result.updates.length, 0);
  assert.equal(result.unchanged, 1);
});

test("uses birthdate to disambiguate players with the same normalized name", () => {
  const older = storedPlayer({
    id: "older-aho",
    legacyId: "7",
    firstName: "Sebastian",
    lastName: "Aho",
    fullName: "Sebastian Aho",
    birthday: "1996-02-17",
  });
  const younger = storedPlayer({
    id: "younger-aho",
    legacyId: "8",
    firstName: "Sebastian",
    lastName: "Aho",
    fullName: "Sebastian Aho",
    birthday: "1997-07-26",
  });
  const source = sourcePlayer({
    firstName: "Sebastian",
    lastName: "Aho",
    fullName: "Sebastian Aho",
    birthDate: "1997-07-26",
  });

  const result = reconcilePlayerDirectory([older, younger], [source], {
    currentDate: CURRENT_DATE,
    deactivateMissing: false,
  });

  const matchedUpdate = result.updates.find(
    (update) => update.reason !== "missingFromPuckPedia",
  );
  assert.equal(matchedUpdate?.id, "younger-aho");
  assert.equal(result.inserts.length, 0);
});

test("does not merge a name match when stable NHL ids conflict", () => {
  const existing = storedPlayer({ nhlApiId: "1111111" });
  const source = sourcePlayer({ nhlApiId: "2222222" });

  const result = reconcilePlayerDirectory([existing], [source], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
  });

  assert.equal(result.updates.length, 0);
  assert.equal(result.inserts.length, 0);
  assert.equal(result.deactivations.length, 0);
  assert.equal(result.issues[0]?.reason, "existingNhlApiIdConflict");
});

test("inserts new active players and deactivates unmatched active rows", () => {
  const unmatched = storedPlayer({
    id: "retired-player",
    legacyId: "12",
    nhlApiId: "8470000",
    fullName: "Former Player",
    firstName: "Former",
    lastName: "Player",
  });
  const source = sourcePlayer({
    nhlApiId: "8489999",
    firstName: "New",
    lastName: "Skater",
    fullName: "New Skater",
    birthDate: "2004-01-02",
    positions: ["C"],
    posGroup: "F",
    teamAbbr: "TOR",
  });

  const result = reconcilePlayerDirectory([unmatched], [source], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
    activityEvidenceByPlayerId: new Map([[unmatched.id, activityEvidence()]]),
  });

  assert.equal(result.inserts.length, 1);
  assert.equal(result.inserts[0]?.legacyId, "13");
  assert.equal(result.inserts[0]?.isActive, true);
  assert.deepEqual(result.inserts[0]?.nhlTeam, ["TOR"]);
  assert.deepEqual(result.inserts[0]?.nhlPos, ["C"]);
  assert.equal(result.insertReviews[0]?.fullName, "New Skater");
  assert.equal(result.deactivations[0]?.id, "retired-player");
  assert.equal(result.unmatchedActivePlayers[0]?.id, "retired-player");
  assert.equal(result.deactivationReviews[0]?.decision, "deactivate");
});

test("shows close existing candidates beside a proposed insert", () => {
  const existing = storedPlayer({
    id: "possible-duplicate",
    nhlApiId: null,
    firstName: "Connor",
    lastName: "McDavid",
    fullName: "Connor McDavid",
    birthday: "1990-01-13",
    nhlPos: ["C"],
    posGroup: "F",
  });
  const source = sourcePlayer({
    nhlApiId: "8478402",
    firstName: "Connor",
    lastName: "McDavid",
    fullName: "Connor McDavid",
    birthDate: "1997-01-13",
    positions: ["C"],
    posGroup: "F",
  });

  const result = reconcilePlayerDirectory([existing], [source], {
    currentDate: CURRENT_DATE,
    deactivateMissing: false,
  });

  assert.equal(result.inserts.length, 1);
  assert.equal(
    result.insertReviews[0]?.closestExistingPlayers[0]?.id,
    "possible-duplicate",
  );
  assert.ok(
    result.insertReviews[0]?.closestExistingPlayers[0]?.signals.includes(
      "sameCanonicalName",
    ),
  );
});

test("reports missing active players without deactivating them", () => {
  const result = reconcilePlayerDirectory([storedPlayer()], [], {
    currentDate: CURRENT_DATE,
    deactivateMissing: false,
  });

  assert.equal(result.deactivations.length, 0);
  assert.equal(result.unmatchedActivePlayers.length, 1);
  assert.equal(result.unmatchedActivePlayers[0]?.fullName, "Michael Anderson");
});

test("keeps unmatched players active when they played in either recent season", () => {
  const currentPlayer = storedPlayer({ id: "current-player" });
  const previousPlayer = storedPlayer({ id: "previous-player" });
  const result = reconcilePlayerDirectory([currentPlayer, previousPlayer], [], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
    activityEvidenceByPlayerId: new Map([
      [
        currentPlayer.id,
        activityEvidence({
          currentSeasonGames: 3,
          previousSeasonGames: 0,
        }),
      ],
      [
        previousPlayer.id,
        activityEvidence({
          currentSeasonGames: 0,
          previousSeasonGames: 12,
        }),
      ],
    ]),
  });

  assert.equal(result.deactivations.length, 0);
  assert.deepEqual(
    result.deactivationReviews.map((review) => review.decision).sort(),
    ["keepCurrentSeasonGames", "keepPreviousSeasonGames"].sort(),
  );
});

test("clears stale NHL roster and contract data for an unmatched player", () => {
  const player = storedPlayer({
    id: "unsigned-player",
    jerseyNum: 44,
    nhlContractStatus: "cur",
    nhlContractLength: "3",
    nhlSalary: 2_000_000,
    nhlCapHit: 2_000_000,
    nhlClauses: "NTC",
    nhlExpiryYear: "2028",
  });
  const result = reconcilePlayerDirectory([player], [], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
    activityEvidenceByPlayerId: new Map([
      [player.id, activityEvidence({ currentSeasonGames: 4 })],
    ]),
  });

  assert.equal(result.deactivations.length, 0);
  assert.equal(result.updates[0]?.reason, "missingFromPuckPedia");
  assert.deepEqual(result.updates[0]?.data.nhlTeam, []);
  assert.equal(result.updates[0]?.data.jerseyNum, null);
  assert.equal(result.updates[0]?.data.nhlContractStatus, null);
  assert.equal(result.updates[0]?.data.nhlContractLength, null);
  assert.equal(result.updates[0]?.data.nhlSalary, null);
  assert.equal(result.updates[0]?.data.nhlCapHit, null);
  assert.equal(result.updates[0]?.data.nhlClauses, null);
  assert.equal(result.updates[0]?.data.nhlExpiryYear, null);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.updates[0]?.data ?? {},
      "isActive",
    ),
    false,
  );
});

test("does not deactivate when current and previous seasons cannot be resolved", () => {
  const player = storedPlayer();
  const result = reconcilePlayerDirectory([player], [], {
    currentDate: CURRENT_DATE,
    deactivateMissing: true,
    activityEvidenceByPlayerId: new Map([
      [player.id, activityEvidence({ evidenceComplete: false })],
    ]),
  });

  assert.equal(result.deactivations.length, 0);
  assert.equal(
    result.deactivationReviews[0]?.decision,
    "keepIncompleteEvidence",
  );
});

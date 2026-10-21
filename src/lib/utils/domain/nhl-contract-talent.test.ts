import assert from "node:assert/strict";
import { test } from "node:test";
import type { NhlContractAnalyticsInput } from "../../types/nhl-contract-analytics";
import type { NhlContractTalentSeason } from "../../types/nhl-contract-talent";
import { summarizeContractTalent } from "./nhl-contract-talent";

const contract: NhlContractAnalyticsInput & { playerId: string } = {
  id: "contract",
  playerId: "player",
  playerName: "Player",
  position: "F",
  signingDate: Date.UTC(2020, 6, 1),
  startSeasonStartYear: 2020,
  expirySeasonStartYear: 2021,
  length: 2,
  seasons: [{ seasonStartYear: 2020, capHit: 1_000_000 }],
};
const season = (
  seasonStartYear: number,
  patch: Partial<NhlContractTalentSeason> = {},
): NhlContractTalentSeason => ({
  seasonStartYear,
  playerId: "player",
  position: "F",
  games: 20,
  minutes: 300,
  teamGames: 82,
  goalsAboveReplacement: 10,
  qualification: "ranked",
  complete: true,
  sourceId: `source-${seasonStartYear}`,
  sourceHash: "a".repeat(64),
  sourceFetchedAt: 1,
  ...patch,
});
const summarize = (
  rows: readonly NhlContractTalentSeason[],
  currentSeasonStartYear = 2022,
) => summarizeContractTalent(contract, rows, { currentSeasonStartYear });

void test("uses official schedule rather than player games, averaging annual GAR82 equally", () => {
  const result = summarize([
    season(2020, { teamGames: 56, games: 10, goalsAboveReplacement: 7 }),
    season(2021, { teamGames: 82, games: 82, goalsAboveReplacement: -2 }),
  ]);
  assert.equal(result.completedDeliveredGoalsAboveReplacement, 5);
  assert.equal(result.finalContractGar82Average, ((7 * 82) / 56 - 2) / 2);
  assert.notEqual(result.finalContractGar82Average, ((7 * 82) / 10 - 2) / 2);
  assert.deepEqual(result.coveredCompletedYears, [2020, 2021]);
});

void test("missing and provisional years never become zeros or a complete historical average", () => {
  const missing = summarize([season(2020)]);
  assert.equal(missing.completedYearsGar82Average, null);
  assert.equal(missing.finalContractGar82Average, null);
  assert.equal(missing.completedDeliveredGoalsAboveReplacement, null);
  assert.equal(missing.observedDeliveredGoalsAboveReplacement, 10);
  assert.equal(missing.coveredCompletedYearsGar82Average, 10);
  assert.deepEqual(missing.missingYears, [2021]);
  for (const patch of [
    { qualification: "provisional", goalsAboveReplacement: null },
    { qualification: "incomplete", goalsAboveReplacement: null },
    { qualification: "insufficient-reference", goalsAboveReplacement: null },
    { qualification: "missing-source", goalsAboveReplacement: null },
    { qualification: "unresolved-player", goalsAboveReplacement: null },
    { qualification: "source-stat-mismatch", goalsAboveReplacement: null },
    { complete: false },
    { teamGames: null },
  ]) {
    const result = summarize([season(2020), season(2021, patch)]);
    assert.equal(result.completedYearsGar82Average, null);
    assert.equal(result.coveredYearCount, 1);
    assert.deepEqual(result.provisionalYears, [2021]);
  }
});

void test("COVID uneven schedules use mean official league team games without integer rounding", () => {
  const teamGames = 2164 / 31;
  const result = summarize([
    season(2020, { teamGames, goalsAboveReplacement: 9 }),
    season(2021),
  ]);
  assert.equal(result.years[0]?.gar82, (9 * 82) / teamGames);
  assert.equal(
    result.finalContractGar82Average,
    ((9 * 82) / teamGames + 10) / 2,
  );
});

void test("current partial contribution stays separate and future term years are not zero-filled", () => {
  const result = summarizeContractTalent(
    { ...contract, expirySeasonStartYear: 2023, length: 4 },
    [
      season(2020),
      season(2021),
      season(2022, {
        complete: false,
        teamGames: null,
        games: 7,
        goalsAboveReplacement: 3,
      }),
    ],
    { currentSeasonStartYear: 2022 },
  );
  assert.equal(result.completedYearsGar82Average, 10);
  assert.equal(result.finalContractGar82Average, null);
  assert.equal(result.currentSeason?.goalsAboveReplacement, 3);
  assert.equal(result.currentSeason?.gar82, null);
  assert.equal(result.currentSeason?.state, "partial");
  assert.equal(result.completedDeliveredGoalsAboveReplacement, 20);
  assert.deepEqual(result.futureYears, [2023]);
  assert.deepEqual(result.expectedCompletedYears, [2020, 2021]);
  assert.equal(result.years.at(-1)?.goalsAboveReplacement, null);
});

void test("future and first-year contracts do not have fabricated historical averages", () => {
  for (const current of [2019, 2020]) {
    const result = summarize([], current);
    assert.equal(result.completedYearsGar82Average, null);
    assert.equal(result.coveredCompletedYearsGar82Average, null);
    assert.equal(result.observedDeliveredGoalsAboveReplacement, null);
    assert.equal(result.expectedYearCount, 0);
  }
});

void test("explicit verified absence counts as known zero, unlike missing source", () => {
  const absent = season(2021, {
    qualification: "no-nhl-games",
    games: 0,
    minutes: 0,
    goalsAboveReplacement: 0,
  });
  const result = summarize([
    season(2020, { goalsAboveReplacement: -4 }),
    absent,
  ]);
  assert.equal(result.finalContractGar82Average, -2);
  assert.equal(result.coveredYearCount, 2);
  for (const patch of [
    { complete: false },
    { games: 1 },
    { minutes: 1 },
    { goalsAboveReplacement: null },
    { teamGames: null },
  ])
    assert.throws(
      () => summarize([season(2020), { ...absent, ...patch }]),
      /absence/,
    );
});

void test("all positions use the same signed goal units; changing salary cannot change talent", () => {
  const baseline = summarize([
    season(2020, { goalsAboveReplacement: 0 }),
    season(2021, { goalsAboveReplacement: -6 }),
  ]);
  for (const position of ["F", "D", "G"] as const) {
    const rows = [
      season(2020, { position, goalsAboveReplacement: 0 }),
      season(2021, { position, goalsAboveReplacement: -6 }),
    ];
    assert.equal(summarize(rows).finalContractGar82Average, -3);
    assert.deepEqual(
      summarizeContractTalent(
        {
          ...contract,
          seasons: [{ seasonStartYear: 2020, capHit: 999_999_999 }],
        },
        rows,
        { currentSeasonStartYear: 2022 },
      ),
      baseline,
    );
  }
});

void test("invalid identity, term, models and source evidence fail closed", () => {
  for (const patch of [
    { playerId: "wrong" },
    { modelVersion: "legacy" },
    { qualification: "" },
    { goalsAboveReplacement: Number.NaN },
    { games: -1 },
    { minutes: Infinity },
    { teamGames: 0 },
    { teamGames: 101 },
    { sourceHash: "wrong" },
    { sourceFetchedAt: NaN },
    { sourceId: "" },
    { games: 0 },
    { minutes: 0 },
  ])
    assert.throws(() => summarize([season(2020, patch)]));
  assert.throws(() => summarize([season(2020), season(2020)]), /duplicate/);
  assert.throws(() => summarize([season(2023)]), /Invalid/);
  assert.throws(
    () =>
      summarizeContractTalent({ ...contract, playerId: undefined }, [], {
        currentSeasonStartYear: 2022,
      }),
    /identity/,
  );
  assert.throws(
    () =>
      summarizeContractTalent({ ...contract, length: 3 }, [], {
        currentSeasonStartYear: 2022,
      }),
    /term/,
  );
});

void test("history outside the contract cannot inflate the term average; provenance and inputs are preserved", () => {
  const rows = Object.freeze([
    Object.freeze(season(2019, { goalsAboveReplacement: 900 })),
    Object.freeze(season(2021)),
    Object.freeze(season(2020)),
  ]);
  const before = JSON.stringify(rows);
  const result = summarize(rows);
  assert.equal(result.finalContractGar82Average, 10);
  assert.equal(result.years[0]?.sourceId, "source-2020");
  assert.equal(result.years[0]?.sourceHash, "a".repeat(64));
  assert.equal(JSON.stringify(rows), before);
  result.years[0].goalsAboveReplacement = 800;
  assert.equal(rows[2]?.goalsAboveReplacement, 10);
});

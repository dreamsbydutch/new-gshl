import assert from "node:assert/strict";
import test from "node:test";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import { impactBreakdown } from "../../runtime/nhl-impact-breakdown";
import {
  rankNhlOverallPreview,
  rankNhlReplacementPreview,
  NHL_REPLACEMENT_DEPTH_PRESETS,
  type OverallPreviewInput,
} from "../../runtime/nhl-overall-rating";

function reconcile(input: OverallPreviewInput) {
  for (const p of input.ratings) {
    const breakdown = impactBreakdown(input.model, p.playerId, p.situations);
    p.components.adjustedProcess = breakdown.total;
    p.components.offensiveProcess = breakdown.offense;
    p.components.defensiveProcess = breakdown.defense;
    p.seasonValue =
      (p.position === "G" ? p.components.saving : breakdown.total) +
      p.components.finishing +
      p.components.penalties;
  }
}

function fixture() {
  const coefficients: Record<string, number> = {};
  const ratings: GameSeasonRating[] = Array.from(
    { length: 15 },
    (_, index): GameSeasonRating => {
      const playerId = index + 1;
      const position = index < 5 ? "F" : index < 10 ? "D" : "G";
      if (position !== "G") {
        coefficients[`O:EV:${playerId}`] = playerId === 1 ? 0.2 : 0;
        coefficients[`D:EV:${playerId}`] = playerId === 6 ? -0.2 : 0;
      }
      return {
        playerId,
        name: `Player ${playerId}`,
        position,
        status: "rated",
        games: 40,
        verifiedGames: 40,
        includedGames: 40,
        minutes: 600,
        modeledMinutes: 600,
        coverage: 1,
        componentCoverage: {
          officialMinutes: 1,
          processMinutes: 1,
          individualShots: 1,
          missingGoals: 0,
        },
        seasonValue: 0,
        observedValue: 0,
        abilityPer60: 0,
        seasonRank: 1,
        abilityRank: 1,
        seasonRating: 50,
        components: {
          adjustedProcess: 0,
          observedProcess: 0,
          finishing: 0,
          penalties: 0,
          saving: playerId === 11 ? 2 : 0,
        },
        situations: position === "G" ? {} : { "5v5:GG": 600 },
        samplingInterval: { low: -100, high: 100, bestRank: 1, worstRank: 5 },
        warnings: [],
      };
    },
  );
  const input = { model: { coefficients }, ratings };
  reconcile(input);
  return input;
}

const close = (a: number | null, b: number) =>
  assert.ok(a !== null && Math.abs(a - b) < 1e-10, `${a} differs from ${b}`);

test("equal offensive, defensive and goalie goal contributions share an overall competition rank", () => {
  const input = fixture();
  const copy = structuredClone(input);
  const report = rankNhlOverallPreview(input);
  for (const id of [1, 6, 11]) {
    const p = report.ratings.find((p) => p.playerId === id)!;
    close(p.overallValue, 1.6);
    assert.equal(p.overallRank, 1);
  }
  close(
    report.ratings.find((p) => p.playerId === 1)!.components!.offensiveProcess,
    1.6,
  );
  close(
    report.ratings.find((p) => p.playerId === 6)!.components!.defensiveProcess,
    1.6,
  );
  close(report.ratings.find((p) => p.playerId === 11)!.components!.saving, 1.6);
  assert.ok(
    report.ratings
      .filter((p) => ![1, 6, 11].includes(p.playerId))
      .every((p) => p.overallRank === 4),
  );
  for (const position of ["F", "D", "G"])
    close(
      report.ratings
        .filter((p) => p.position === position)
        .reduce((sum, p) => sum + p.overallValue!, 0),
      0,
    );
  assert.deepEqual(input, copy);
  assert.ok(report.ratings.every((p) => !("samplingInterval" in p)));
});

function replacementFixture() {
  const coefficients: Record<string, number> = {};
  const ratings: GameSeasonRating[] = [];
  for (const [offset, position] of [
    [0, "F"],
    [8, "D"],
    [16, "G"],
  ] as const)
    for (let index = 0; index < 8; index++) {
      const p = structuredClone(fixture().ratings[0]!);
      p.playerId = offset + index + 1;
      p.position = position;
      p.name = `${position}${index}`;
      p.minutes = index === 0 ? 600 : index === 1 ? 500 : 120 - index * 10;
      p.modeledMinutes = p.minutes;
      p.status = index < 2 ? "rated" : "provisional";
      p.situations = position === "G" ? {} : { "5v5:GG": p.minutes };
      p.components = {
        adjustedProcess: 0,
        observedProcess: 0,
        finishing: 0,
        penalties: 0,
        saving: position === "G" && index < 2 ? (p.minutes * 0.2) / 60 : 0,
      };
      p.abilityPer60 = 0;
      if (position !== "G") {
        coefficients[`O:EV:${p.playerId}`] =
          position === "F" && index < 2 ? 0.2 : 0;
        coefficients[`D:EV:${p.playerId}`] =
          position === "D" && index < 2 ? -0.2 : 0;
      }
      ratings.push(p);
    }
  const input = {
    model: { coefficients },
    ratings,
    numberOfTeams: 1,
    depth: { F: 2, D: 2, G: 2, PP: 2, SH: 2 },
  };
  reconcile(input);
  return input;
}

test("replacement references admit covered low-minute provisionals without giving them official ranks", () => {
  const input = replacementFixture();
  const copy = structuredClone(input);
  const report = rankNhlReplacementPreview(input);
  assert.equal(report.referenceEligibility.lowMinuteProvisionalPlayers, 18);
  for (const position of ["F", "D", "G"] as const) {
    assert.equal(report.references[position].players, 6);
    assert.equal(report.references[position].supported, true);
  }
  for (const id of [1, 9, 17]) {
    const p = report.ratings.find((p) => p.playerId === id)!;
    close(p.overallValue, 2);
    assert.equal(p.overallRank, 1);
  }
  assert.ok(
    report.ratings
      .filter((p) => p.status === "provisional")
      .every(
        (p) =>
          p.referenceEligible &&
          p.overallValue === null &&
          p.overallRank === null,
      ),
  );
  assert.deepEqual(input, copy);
});

test("above-replacement productivity adds value with workload and the fitted replacement profile has zero value", () => {
  const input = replacementFixture();
  let report = rankNhlReplacementPreview(input);
  assert.ok(
    report.ratings.find((p) => p.playerId === 1)!.overallValue! >
      report.ratings.find((p) => p.playerId === 2)!.overallValue!,
  );
  input.model.coefficients["O:EV:1"] = 0;
  reconcile(input);
  report = rankNhlReplacementPreview(input);
  close(report.ratings.find((p) => p.playerId === 1)!.overallValue, 0);
});

test("replacement cohort selection uses exposure rather than scoring and keeps cutoff ties regular", () => {
  const input = replacementFixture();
  const before = rankNhlReplacementPreview(input);
  input.model.coefficients["O:EV:3"] = 100;
  input.ratings[2]!.components.finishing = 100;
  reconcile(input);
  const after = rankNhlReplacementPreview(input);
  assert.deepEqual(before.cohortSelection, after.cohortSelection);
  assert.ok(after.references.F.playerIds.includes(3));
  const tied = input.ratings[2]!;
  tied.minutes = 500;
  tied.modeledMinutes = 500;
  tied.situations = { "5v5:GG": 500 };
  tied.status = "rated";
  reconcile(input);
  const ties = rankNhlReplacementPreview(input);
  assert.equal(ties.cohortSelection.EV_F!.regularPlayersIncludingCutoffTies, 3);
  assert.ok(!ties.references.F.playerIds.includes(3));
});

test("replacement scores cancel position-family coefficient anchors and preserve shared offense/defense cohorts", () => {
  const input = replacementFixture();
  for (const p of input.ratings.filter((p) => p.position !== "G")) {
    p.situations = {
      "5v5:GG": p.minutes * 0.6,
      "5v4:GG": p.minutes * 0.2,
      "4v5:GG": p.minutes * 0.1,
      "6v5:EG": p.minutes * 0.1,
    };
    for (const family of ["PP", "SH", "EN"]) {
      input.model.coefficients[`O:${family}:${p.playerId}`] =
        (p.playerId % 3) * 0.1;
      input.model.coefficients[`D:${family}:${p.playerId}`] =
        (p.playerId % 2) * -0.1;
    }
  }
  reconcile(input);
  const before = rankNhlReplacementPreview(input);
  for (const p of input.ratings.filter((p) => p.position !== "G")) {
    for (const family of ["EV", "PP", "SH", "EN"]) {
      input.model.coefficients[`O:${family}:${p.playerId}`]! +=
        p.position === "F" ? 3 : 2;
      input.model.coefficients[`D:${family}:${p.playerId}`]! -=
        p.position === "F" ? 2 : 4;
    }
  }
  reconcile(input);
  const after = rankNhlReplacementPreview(input);
  for (const p of before.ratings.filter((p) => p.overallValue !== null)) {
    const next = after.ratings.find((q) => q.playerId === p.playerId)!;
    close(next.overallValue, p.overallValue!);
    assert.equal(next.overallRank, p.overallRank);
  }
  assert.deepEqual(
    after.references.F.processByFamily.EV!.playerIds,
    after.references.F.playerIds,
  );
  for (const position of ["F", "D"] as const)
    for (const family of ["EV", "PP", "SH", "EN"])
      assert.equal(
        after.references[position].processByFamily[family]!.supported,
        true,
      );
});

test("invalid-value regulars retain depth and ambiguous memberships are excluded without compaction", () => {
  const input = replacementFixture();
  const before = rankNhlReplacementPreview(input);
  input.ratings[0]!.components.finishing = NaN;
  const invalid = rankNhlReplacementPreview(input);
  assert.deepEqual(before.cohortSelection, invalid.cohortSelection);
  assert.equal(
    invalid.ratings.find((p) => p.playerId === 1)!.overallValue,
    null,
  );
  assert.equal(invalid.references.F.players, 6);
  input.ratings[0]!.componentCoverage.processMinutes = 0.5;
  const unknown = rankNhlReplacementPreview(input);
  assert.equal(unknown.cohortSelection.EV_F!.exposureSupported, false);
  assert.equal(unknown.cohortSelection.EV_F!.cutoffMinutes, null);
  assert.ok(unknown.cohortSelection.EV_F!.ambiguousPlayerIds.includes(3));
  assert.ok(!unknown.references.F.playerIds.includes(3));
  assert.equal(unknown.references.F.players, 5);
  assert.equal(unknown.references.F.supported, true);
});

test("a sparse unmodeled callup does not prevent certainty about the existing replacement pool", () => {
  const input = replacementFixture();
  const before = rankNhlReplacementPreview(input);
  const callup = structuredClone(input.ratings[2]!);
  callup.playerId = 99;
  callup.status = "incomplete";
  callup.minutes = 0.75;
  callup.modeledMinutes = 0;
  callup.componentCoverage.processMinutes = 0;
  callup.situations = {};
  input.ratings.push(callup);
  const after = rankNhlReplacementPreview(input);
  assert.deepEqual(after.references.F.playerIds, before.references.F.playerIds);
  assert.deepEqual(
    after.references.F.processByFamily.EV,
    before.references.F.processByFamily.EV,
  );
  const bound = after.cohortSelection.EV_F!.membershipBounds.find(
    (m) => m.playerId === 99,
  )!;
  assert.equal(bound.lower, 0);
  assert.equal(bound.upper, 0.75);
  assert.equal(bound.membership, "certain-replacement");
  assert.ok(
    after.cohortSelection.EV_F!.unobservedReplacementExposurePlayerIds.includes(
      99,
    ),
  );
});

test("unknown goalie saving and inadequate reference evidence are excluded without invented fallback", () => {
  const input = replacementFixture();
  input.ratings[18]!.abilityPer60 = null;
  input.ratings[19]!.componentCoverage.individualShots = 0.5;
  const report = rankNhlReplacementPreview(input);
  assert.equal(report.references.G.players, 4);
  assert.equal(report.references.G.savingPer60, null);
  assert.ok(
    report.referenceEligibility.exclusions.some(
      (e) => e.playerId === 19 && e.reason.includes("Unknown goalie"),
    ),
  );
  assert.ok(
    report.ratings
      .filter((p) => p.position === "G")
      .every((p) => p.overallValue === null),
  );
});

test("fixed depth sensitivity is reported without choosing a preferred resulting ranking", () => {
  const input = replacementFixture();
  const defaults = rankNhlReplacementPreview({ ...input, depth: undefined });
  assert.deepEqual(defaults.depth, { F: 13, D: 7, G: 2, PP: 11, SH: 9 });
  assert.equal(defaults.references.F.supported, false);
  const reports = Object.entries(NHL_REPLACEMENT_DEPTH_PRESETS).map(
    ([name, depth]) => ({
      name,
      report: rankNhlReplacementPreview({ ...input, depth }),
    }),
  );
  assert.deepEqual(
    reports.map((r) => r.name),
    ["narrow", "default", "wide"],
  );
  assert.throws(
    () => rankNhlReplacementPreview({ ...input, numberOfTeams: 0 }),
    /team count/,
  );
});

test("a goal of finishing or penalty value receives the same centered goal credit as process", () => {
  const process = fixture();
  const finish = fixture();
  const penalty = fixture();
  finish.model.coefficients["O:EV:1"] = 0;
  finish.ratings[0]!.components.finishing = 2;
  penalty.model.coefficients["O:EV:1"] = 0;
  penalty.ratings[0]!.components.penalties = 2;
  reconcile(finish);
  reconcile(penalty);
  const values = [process, finish, penalty].map(
    (input) =>
      rankNhlOverallPreview(input).ratings.find((p) => p.playerId === 1)!
        .overallValue,
  );
  values.forEach((v) => close(v, 1.6));
});

test("within-position offense and defense coefficient shifts cancel in every strength family", () => {
  const input = fixture();
  for (const p of input.ratings.filter((p) => p.position === "F")) {
    p.situations = {
      "5v5:GG": 300,
      "5v4:GG": 100,
      "4v5:GG": 100,
      "6v5:EG": 100,
    };
    for (const family of ["PP", "SH", "EN"]) {
      input.model.coefficients[`O:${family}:${p.playerId}`] =
        p.playerId === 1 ? 0.6 : 0;
      input.model.coefficients[`D:${family}:${p.playerId}`] =
        p.playerId === 2 ? -0.3 : 0;
    }
  }
  reconcile(input);
  const before = rankNhlOverallPreview(input);
  for (const p of input.ratings.filter((p) => p.position === "F"))
    for (const family of ["EV", "PP", "SH", "EN"]) {
      input.model.coefficients[`O:${family}:${p.playerId}`]! += 3;
      input.model.coefficients[`D:${family}:${p.playerId}`]! -= 2;
    }
  reconcile(input);
  const after = rankNhlOverallPreview(input);
  for (const row of before.ratings) {
    const next = after.ratings.find((p) => p.playerId === row.playerId)!;
    close(next.overallValue, row.overallValue!);
    assert.equal(next.overallRank, row.overallRank);
  }
  assert.deepEqual(Object.keys(after.references.F.processByFamily).sort(), [
    "EN",
    "EV",
    "PP",
    "SH",
  ]);
});

test("unqualified rows never enter reference means or ranks and insufficient positions are withheld", () => {
  const input = fixture();
  const provisional = structuredClone(input.ratings[0]!);
  provisional.playerId = 99;
  provisional.status = "provisional";
  provisional.components.finishing = 100000;
  provisional.situations = { bogus: 100000 };
  const before = rankNhlOverallPreview(input);
  input.ratings.push(provisional);
  const after = rankNhlOverallPreview(input);
  assert.deepEqual(before.references, after.references);
  assert.deepEqual(
    before.ratings,
    after.ratings.filter((p) => p.playerId !== 99),
  );
  assert.equal(
    after.ratings.find((p) => p.playerId === 99)!.overallValue,
    null,
  );
  input.ratings[4]!.status = "incomplete";
  const short = rankNhlOverallPreview(input);
  assert.equal(short.references.F.supported, false);
  assert.equal(short.references.F.finishingPer60, null);
  assert.ok(
    short.ratings
      .filter((p) => p.position === "F")
      .every((p) => p.overallRank === null),
  );
  assert.ok(
    short.ratings
      .filter((p) => p.position !== "F")
      .every((p) => p.overallRank !== null),
  );
});

test("official minutes determine individual-component baselines and exposure rounding is respected", () => {
  const input = fixture();
  input.ratings[0]!.minutes = 1000;
  input.ratings[0]!.modeledMinutes = 980.0123;
  input.ratings[0]!.situations = { "5v5:GG": 980.0123 };
  input.ratings[0]!.componentCoverage.processMinutes = 0.98;
  input.ratings[0]!.componentCoverage.officialMinutes = 0.99;
  input.ratings[0]!.components.finishing = 10;
  reconcile(input);
  const report = rankNhlOverallPreview(input);
  close(report.references.F.officialMinutes, 3390);
  close(report.references.F.finishingPer60, (10 * 60) / 3390);
  close(
    report.ratings.find((p) => p.playerId === 1)!.components!.finishing,
    10 - (10 * 990) / 3390,
  );
});

test("rare strength families with fewer than five observed players withhold their users", () => {
  const input = fixture();
  const specialist = input.ratings[0]!;
  specialist.situations = { "5v5:GG": 590, "5v4:GG": 10 };
  input.model.coefficients["O:PP:1"] = 1;
  input.model.coefficients["D:PP:1"] = 0;
  reconcile(input);
  const report = rankNhlOverallPreview(input);
  assert.equal(report.references.F.processByFamily.PP!.players, 1);
  assert.equal(report.references.F.processByFamily.PP!.supported, false);
  const p = report.ratings.find((p) => p.playerId === 1)!;
  assert.equal(p.qualification, "insufficient-reference");
  assert.equal(p.overallValue, null);
  assert.equal(p.overallRank, null);
  assert.match(p.warnings[0]!, /F\/PP.*withheld/);
});

test("unknown effects, inconsistent breakdowns, bad coverage and duplicate identities fail explicitly", () => {
  const missing = fixture();
  delete missing.model.coefficients["O:EV:1"];
  assert.throws(
    () => rankNhlOverallPreview(missing),
    /Unknown player-family effects/,
  );
  const wrongProcess = fixture();
  wrongProcess.ratings[0]!.components.adjustedProcess += 0.1;
  assert.throws(
    () => rankNhlOverallPreview(wrongProcess),
    /does not reconcile/,
  );
  const wrongSeason = fixture();
  wrongSeason.ratings[0]!.seasonValue! += 0.1;
  assert.throws(() => rankNhlOverallPreview(wrongSeason), /Season components/);
  const badCoverage = fixture();
  badCoverage.ratings[0]!.componentCoverage.processMinutes = 0.94;
  assert.throws(() => rankNhlOverallPreview(badCoverage), /coverage/);
  const duplicate = fixture();
  duplicate.ratings.push(duplicate.ratings[0]!);
  assert.throws(() => rankNhlOverallPreview(duplicate), /duplicate/);
  const nonfinite = fixture();
  nonfinite.ratings[0]!.components.finishing = NaN;
  assert.throws(
    () => rankNhlOverallPreview(nonfinite),
    /Invalid rated-player value/,
  );
});

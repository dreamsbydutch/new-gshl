import assert from "node:assert/strict";
import { test } from "node:test";
import type { NhlTalentPeerCalibrationRow } from "../../types/nhl-contract-talent-peer-calibration";
import type { NhlTalentForecastProfile } from "../../types/nhl-contract-talent-forecast";
import {
  classifyNhlTalentPeerGroup,
  fitNhlTalentPeerCalibration,
  peerCalibrationWeight,
  validateNhlTalentPeerCalibration,
} from "./nhl-contract-talent-peer-calibration";

const rows = (): NhlTalentPeerCalibrationRow[] =>
  Array.from({ length: 120 }, (_, i) => {
    const originYear = 2016 + Math.floor(i / 60),
      horizon = 2 + Math.floor((i % 60) / 30);
    return {
      nhlPlayerId: 1 + (i % 30),
      originYear,
      targetYear: originYear + horizon,
      horizon,
      group: "young:high",
      target: 12,
      positionPrediction: 10,
      peerPrediction: 12,
    };
  });
void test("peer calibration uses only completed earlier forecast targets and shrinks unsupported samples", () => {
  const input = rows(),
    past = fitNhlTalentPeerCalibration(input, 2018);
  assert.equal(peerCalibrationWeight(past, "young:high"), 0);
  const changed = input.map((r) => ({
    ...r,
    target: r.targetYear > 2018 ? -1000 : r.target,
  }));
  assert.deepEqual(fitNhlTalentPeerCalibration(changed, 2018), past);
  const fitted = fitNhlTalentPeerCalibration(input, 2020);
  assert.equal(peerCalibrationWeight(fitted, "young:high"), 480 / 580);
  assert.equal(fitted.groups["young:high"]!.players, 30);
  assert.equal(fitted.groups["young:high"]!.origins, 2);
  assert.doesNotThrow(() => validateNhlTalentPeerCalibration(fitted));
});
void test("unhelpful peer adjustments receive zero weight and invented weights fail validation", () => {
  const fitted = fitNhlTalentPeerCalibration(
    rows().map((r) => ({ ...r, target: 10 })),
    2020,
  );
  assert.equal(peerCalibrationWeight(fitted, "young:high"), 0);
  fitted.overall.weight = 1;
  assert.throws(
    () => validateNhlTalentPeerCalibration(fitted),
    /Invalid NHL peer calibration/,
  );
});
void test("development groups use current same-age peer level, not eventual career success", () => {
  const profile = (id: number, gar: number): NhlTalentForecastProfile => ({
    nhlPlayerId: id,
    position: "F",
    originYear: 2026,
    peerAging: null,
    peerGroup: null,
    knownGarSeasons: 3,
    latestAppearanceYear: 2026,
    latestObserved: gar,
    features: [gar, gar - 1, 1400, 1300, 1, 1, 21, 441, 1, 1, 1, 1, 1, 0, 3],
  });
  const peers = Array.from({ length: 20 }, (_, i) => profile(i + 1, i + 1));
  assert.equal(
    classifyNhlTalentPeerGroup(profile(999, 18), peers),
    "young:high",
  );
  assert.equal(classifyNhlTalentPeerGroup(profile(999, 3), peers), "young:low");
  assert.equal(
    classifyNhlTalentPeerGroup(profile(999, 18), peers.slice(0, 9)),
    null,
  );
});

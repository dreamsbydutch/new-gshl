import assert from "node:assert/strict";
import { test } from "node:test";
import forecastJson from "../../data/nhl-contract-talent-forecast.json";
import { parseNhlTalentForecastArtifact } from "./nhl-contract-talent-forecast";
import {
  projectNhlTalentAging,
  validateNhlTalentAging,
} from "./nhl-contract-talent-aging";

function controlled(probability: number) {
  const model = structuredClone(
    parseNhlTalentForecastArtifact(forecastJson).models.find(
      (m) => m.position === "F",
    )!.aging,
  );
  model.returnModel!.coefficients = [
    Math.log(probability / (1 - probability)),
    0,
    0,
    0,
    0,
    0,
    0,
  ];
  model.curve!.peakAge = 25;
  model.curve!.developmentRate = 2;
  model.curve!.declineRate = 1;
  model.bounds = { low: -100, high: 100, samples: 100 };
  return model;
}
void test("survivor development is weighted by first-year and later NHL participation", () => {
  const model = controlled(0.5),
    input = {
      baseline: 10,
      currentGar: 10,
      originAge: 20,
      horizon: 1,
      gamesShare: 1,
      garKnown: true,
    };
  assert.equal(projectNhlTalentAging(model, input), 10);
  // Conditional first-year contribution=20. Age21->22 development=7.
  // Two .5 participation steps produce .25*(20+7), preserving expectation.
  assert.equal(projectNhlTalentAging(model, { ...input, horizon: 2 }), 6.75);
});
void test("development and decline respond to age; eventual absence attenuates signed negative value", () => {
  const model = controlled(0.99),
    input = {
      baseline: 10,
      currentGar: 10,
      originAge: 20,
      horizon: 2,
      gamesShare: 1,
      garKnown: true,
    };
  assert.ok(projectNhlTalentAging(model, input)! > 10);
  assert.ok(projectNhlTalentAging(model, { ...input, originAge: 32 })! < 10);
  model.curve!.developmentRate = 0;
  model.curve!.declineRate = 0;
  model.returnModel!.coefficients = [0, 0, 0, 0, 0, 0, 0];
  assert.equal(projectNhlTalentAging(model, { ...input, baseline: -10 }), -5);
  assert.equal(
    projectNhlTalentAging(model, { ...input, originAge: null }),
    null,
  );
});
void test("serialized aging state rejects invented peaks, future-invalid bounds and nonfinite return coefficients", () => {
  const model = controlled(0.5);
  model.curve!.peakAge = 80;
  assert.throws(
    () => validateNhlTalentAging(model),
    /Invalid NHL talent aging/,
  );
  model.curve!.peakAge = 25;
  model.returnModel!.coefficients[0] = Infinity;
  assert.throws(
    () => validateNhlTalentAging(model),
    /Invalid NHL talent aging/,
  );
  model.returnModel!.coefficients[0] = 0;
  model.bounds = { low: 10, high: -10, samples: 10 };
  assert.throws(
    () => validateNhlTalentAging(model),
    /Invalid NHL talent aging/,
  );
});

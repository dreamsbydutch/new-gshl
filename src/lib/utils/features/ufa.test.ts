import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateUfaFitScore,
  calculateUfaProbabilities,
  calculateUfaSalary,
  getUfaWindow,
  selectUfaOffer,
} from "./ufa";

void test("UFA salary applies and rounds the 125 percent premium", () => {
  assert.equal(calculateUfaSalary(1_000_001), 1_250_001);
  assert.equal(calculateUfaSalary(null), 0);
});

void test("UFA window opens after signing regardless of draft configuration", () => {
  const season = {
    signingEndDate: "2026-06-30",
    draftStartAt: "2026-10-03T23:00:00.000Z",
  };
  assert.equal(
    getUfaWindow(season, new Date("2026-07-01T12:00:00.000Z")).isOpen,
    true,
  );
  assert.equal(
    getUfaWindow(season, new Date("2026-10-03T23:00:00.000Z")).isOpen,
    true,
  );
});

void test("first offers always receive a seven-day window", () => {
  const referenceDate = new Date("2026-10-01T12:00:00.000Z");
  const window = getUfaWindow(
    { signingEndDate: "2026-06-30" },
    referenceDate,
  );
  assert.equal(
    window.deadlineForFirstOffer,
    referenceDate.getTime() + 7 * 24 * 60 * 60 * 1_000,
  );
});

void test("weighted odds total one and preserve the five percent floor", () => {
  const odds = calculateUfaProbabilities([
    { id: "favorite", score: 1 },
    { id: "underdog", score: 0 },
  ]);
  assert.ok(
    Math.abs(odds.reduce((sum, entry) => sum + entry.probability, 0) - 1) <
      1e-12,
  );
  assert.ok(odds.every((entry) => entry.probability >= 0.05));
  assert.equal(selectUfaOffer(odds, 0), "favorite");
  assert.equal(selectUfaOffer(odds, 0.999999), "underdog");
});

void test("fit scoring rewards term and changes roster preference with player performance", () => {
  const developing = calculateUfaFitScore({
    years: 1,
    franchisePerformance: 0.5,
    ownerLadder: 0.5,
    draftCapital: 0.5,
    playerPerformance: 0,
    rosterQuality: 0,
    positionalOpportunity: 1,
  });
  const elite = calculateUfaFitScore({
    years: 3,
    franchisePerformance: 0.5,
    ownerLadder: 0.5,
    draftCapital: 0.5,
    playerPerformance: 1,
    rosterQuality: 1,
    positionalOpportunity: 0,
  });
  assert.ok(Math.abs(developing.rosterFit - 0.65) < 1e-12);
  assert.ok(Math.abs(elite.rosterFit - 0.65) < 1e-12);
  assert.ok(elite.score > developing.score);
});

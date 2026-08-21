import assert from "node:assert/strict";
import test from "node:test";
import type { Contract, Season } from "@gshl-types";
import { ContractStatus, ContractType } from "../domain/constants";
import {
  buildUfaCatalogCandidates,
  calculateUfaFitScore,
  calculateUfaProbabilities,
  calculateUfaSalary,
  formatUfaStat,
  getAffordableUfaTerms,
  getUfaWindow,
  indexLatestUfaNhlStats,
  isEligibleUfaRank,
  rankUfas,
  resolveUfaViewerContext,
  selectAffordableUfas,
  selectUfaHomeCatalogPlayerIds,
  selectTopAffordableUfas,
  selectUfaOffer,
} from "./ufa";

const capSeasons = Array.from(
  { length: 4 },
  (_, index): Season => ({
    id: `season-${2026 + index}`,
    year: 2026 + index,
    name: `Season ${2026 + index}`,
    categories: [],
    rosterSpots: [],
    startDate: `${2025 + index}-10-01`,
    endDate: `${2026 + index}-04-20`,
    signingEndDate: `${2026 + index}-06-20`,
    isActive: index === 0,
    usesLegacyTies: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }),
);

const committedContract: Contract = {
  id: "contract-1",
  playerId: "contracted-player",
  ownerId: "owner-1",
  seasonId: "season-2026",
  contractType: [ContractType.STANDARD],
  contractLength: 3,
  contractSalary: 20_000_000,
  signingDate: "2026-07-01",
  startDate: "2026-10-01",
  signingStatus: ContractStatus.UFA,
  expiryStatus: ContractStatus.RFA,
  expiryDate: "2029-04-20",
  capHit: 20_000_000,
  capHitEndDate: "2029-04-20",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

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
  const window = getUfaWindow({ signingEndDate: "2026-06-30" }, referenceDate);
  assert.equal(
    window.deadlineForFirstOffer,
    referenceDate.getTime() + 7 * 24 * 60 * 60 * 1_000,
  );
});

void test("UFAs rank by salary and the home list keeps only affordable players", () => {
  const ranked = rankUfas([
    { fullName: "Affordable Two", salary: 8_000_000, affordableTerms: [1] },
    { fullName: "Too Expensive", salary: 12_000_000, affordableTerms: [] },
    { fullName: "Affordable One", salary: 10_000_000, affordableTerms: [1, 2] },
  ]);

  assert.deepEqual(
    ranked.map((player) => player.fullName),
    ["Too Expensive", "Affordable One", "Affordable Two"],
  );
  assert.deepEqual(
    selectTopAffordableUfas(ranked, 2).map((player) => player.fullName),
    ["Affordable One", "Affordable Two"],
  );
  assert.deepEqual(
    selectAffordableUfas(ranked).map((player) => player.fullName),
    ["Affordable One", "Affordable Two"],
  );
});

void test("UFAs break equal salaries by overall rating before name", () => {
  const ranked = rankUfas([
    { fullName: "Lower Rated", salary: 10_000_000, overallRating: 78 },
    { fullName: "Higher Rated", salary: 10_000_000, overallRating: 84 },
    { fullName: "Higher Rated Two", salary: 10_000_000, overallRating: 84 },
  ]);

  assert.deepEqual(
    ranked.map((player) => player.fullName),
    ["Higher Rated", "Higher Rated Two", "Lower Rated"],
  );
});

void test("UFA affordability includes committed cap and pending offer reservations", () => {
  const common = {
    ownerId: "owner-1",
    salary: 4_000_000,
    signingSeason: capSeasons[0]!,
    seasons: capSeasons,
    contracts: [committedContract],
    groups: [{ id: "group-1", seasonId: "season-2026" }],
  };

  assert.deepEqual(getAffordableUfaTerms({ ...common, offers: [] }), [1, 2, 3]);
  assert.deepEqual(
    getAffordableUfaTerms({
      ...common,
      offers: [
        {
          groupId: "group-1",
          contractLength: 1,
          salary: 2_000_000,
          status: "pending",
          isMine: true,
        },
      ],
    }),
    [],
  );
});

void test("Home UFA selection matches the full preview and retains active-offer players", () => {
  const players = [
    {
      id: "unaffordable",
      fullName: "Highest Unaffordable",
      isActive: true,
      overallRk: 1,
      overallRating: 95,
      salary: 5_000_000,
    },
    {
      id: "affordable-one",
      fullName: "First Affordable",
      isActive: true,
      overallRk: 2,
      overallRating: 90,
      salary: 4_000_000,
    },
    {
      id: "affordable-two",
      fullName: "Second Affordable",
      isActive: true,
      overallRk: 3,
      overallRating: 85,
      salary: 3_000_000,
    },
    {
      id: "offer-only",
      fullName: "Offer Group Player",
      isActive: true,
      overallRk: 4,
      overallRating: 80,
      salary: 2_000_000,
    },
    {
      id: "contracted-player",
      fullName: "Already Signed",
      isActive: true,
      overallRk: 5,
      overallRating: 99,
      salary: 10_000_000,
    },
  ];
  const groups = [{ id: "group-1", seasonId: "season-2026" }];
  const candidates = buildUfaCatalogCandidates({
    players,
    signingSeason: capSeasons[0]!,
    seasons: capSeasons,
    contracts: [committedContract],
    ownerId: "owner-1",
    groups,
    offers: [],
  });
  const anonymousCandidates = buildUfaCatalogCandidates({
    players,
    signingSeason: capSeasons[0]!,
    seasons: capSeasons,
    contracts: [committedContract],
    ownerId: undefined,
    groups,
    offers: [],
  });

  assert.equal(
    candidates.some(({ player }) => player.id === "contracted-player"),
    false,
  );
  assert.deepEqual(
    selectUfaHomeCatalogPlayerIds({
      candidates: anonymousCandidates,
      isSignedInOwner: false,
      offerGroupPlayerIds: ["offer-only"],
      limit: 2,
    }),
    ["unaffordable", "affordable-one", "offer-only"],
  );
  assert.deepEqual(
    selectUfaHomeCatalogPlayerIds({
      candidates,
      isSignedInOwner: true,
      offerGroupPlayerIds: ["offer-only"],
      limit: 2,
    }),
    ["affordable-one", "affordable-two", "offer-only"],
  );

  const reservedCandidates = buildUfaCatalogCandidates({
    players,
    signingSeason: capSeasons[0]!,
    seasons: capSeasons,
    contracts: [committedContract],
    ownerId: "owner-1",
    groups,
    offers: [
      {
        groupId: "group-1",
        contractLength: 1,
        salary: 2_000_000,
        status: "pending",
        isMine: true,
      },
    ],
  });
  assert.deepEqual(
    selectUfaHomeCatalogPlayerIds({
      candidates: reservedCandidates,
      isSignedInOwner: true,
      offerGroupPlayerIds: ["offer-only"],
      limit: 2,
    }),
    ["offer-only"],
  );

  assert.equal(
    resolveUfaViewerContext({
      ownerId: "owner-1",
      signingSeasonId: "season-2026",
      franchises: [
        {
          id: "franchise-1",
          ownerId: "owner-1",
          isActive: true,
        },
      ],
      teams: [{ franchiseId: "franchise-1", seasonId: "season-2026" }],
    }).isSignedInOwner,
    true,
  );
});

void test("UFA NHL stats use the latest populated season with normalized years", () => {
  const latestStats = indexLatestUfaNhlStats(
    [
      { playerId: "player-1", seasonId: "season-2025", GP: "70" },
      { playerId: "player-1", seasonId: "season-2026", GP: "82" },
      { playerId: "player-2", seasonId: "season-2026", GP: "80" },
    ],
    [
      { id: "season-2025", year: "2025" },
      { id: "season-2026", year: "2026" },
      { id: "season-2027", year: "2027" },
    ],
    "2027",
  );

  assert.deepEqual(
    [...latestStats.entries()].map(([playerId, stats]) => [playerId, stats.GP]),
    [
      ["player-1", "82"],
      ["player-2", "80"],
    ],
  );
});

void test("UFA stats hide zero-game lines without hiding real zero values", () => {
  assert.equal(formatUfaStat({ GP: "0", G: "0" }, "G"), "—");
  assert.equal(formatUfaStat({ GP: "12", G: "0" }, "G"), "0");
  assert.equal(formatUfaStat({ GP: "12", G: "4" }, "G"), "4");
  assert.equal(formatUfaStat({ GP: "12" }, "G"), "—");
});

void test("UFA eligibility includes only overall ranks 1 through 500", () => {
  assert.equal(isEligibleUfaRank({ overallRk: 1 }), true);
  assert.equal(isEligibleUfaRank({ overallRk: 500 }), true);
  assert.equal(isEligibleUfaRank({ overallRk: 501 }), false);
  assert.equal(isEligibleUfaRank({ overallRk: null }), false);
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

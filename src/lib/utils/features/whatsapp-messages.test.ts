import assert from "node:assert/strict";
import test from "node:test";

import type { MatchupDetailsTeam, StarPlayer } from "@gshl-types";
import {
  buildMatchupWhatsAppShareMessage,
  buildTradeBlockWhatsAppShareMessage,
  buildUfaOffersWhatsAppShareMessage,
} from "./whatsapp-messages";

const diamonds: MatchupDetailsTeam = {
  id: "diamonds",
  name: "Diamonds",
  abbr: "DIA",
  logoUrl: null,
  confAbbr: "ACE",
  ownerNickname: null,
};

const firstStar: StarPlayer = {
  id: "player-1",
  fullName: "Alex Star",
  nhlPos: ["C"],
  posGroup: "F",
  G: 2,
  A: 3,
  P: 5,
  Rating: 9.82,
  starRank: 1,
  team: diamonds,
  numericRating: 9.82,
};

void test("builds a final matchup message with the winner and three stars", () => {
  assert.equal(
    buildMatchupWhatsAppShareMessage({
      awayTeam: { name: "Diamonds", score: 8, isWinner: true },
      homeTeam: { name: "Emeralds", score: 5, isWinner: false },
      isComplete: true,
      isTie: false,
      stars: [firstStar],
    }),
    [
      "*GSHL Matchup*\n_FINAL · Diamonds win_",
      "Away: *Diamonds — 8* 🏆\nHome: Emeralds — 5\n*Three Stars*\n1. *Alex Star* (DIA · C) — 9.82 rating · 2 G · 3 A · 5 P",
    ].join("\n\n"),
  );
});

void test("labels an active matchup and its provisional stars", () => {
  assert.equal(
    buildMatchupWhatsAppShareMessage({
      awayTeam: { name: "Diamonds", score: 4, isWinner: false },
      homeTeam: { name: "Emeralds", score: 3, isWinner: false },
      isComplete: false,
      isTie: false,
      stars: [],
    }),
    [
      "*GSHL Matchup*\n_LIVE · Matchup in progress_",
      "Away: Diamonds — 4\nHome: Emeralds — 3\n*Current Three Stars*\nNo player performances yet.",
    ].join("\n\n"),
  );
});

void test("builds one detailed summary for pending contract offers", () => {
  assert.equal(
    buildUfaOffersWhatsAppShareMessage([
      {
        id: "group-1",
        deadlineAt: Date.UTC(2026, 7, 23, 1, 30),
        player: {
          id: "player-1",
          fullName: "Alex Star",
          nhlTeam: "TOR",
          nhlTeamLogoUrl: null,
          positions: ["C"],
          positionGroup: "F",
          salary: 7_500_000,
          seasonRating: 0,
          overallRating: 0,
          stats: null,
          affordableTerms: [1, 2, 3],
          existingOffer: null,
          canOffer: true,
          disabledReason: null,
        },
        offers: [
          {
            id: "offer-1",
            franchiseName: "Diamonds",
            franchiseLogoUrl: null,
            years: 3,
            salary: 7_500_000,
            probability: 0.625,
          },
        ],
      },
    ]),
    [
      "*GSHL Contract Offers*",
      "_1 pending offer across 1 player_",
      "*Alex Star — Diamonds*\n3 years · $7.500 M per season · 62.5% odds\nDecision: Aug 22, 2026 at 9:30 PM ET",
    ].join("\n\n"),
  );
});

void test("builds one detailed summary for the trade block", () => {
  assert.equal(
    buildTradeBlockWhatsAppShareMessage([
      {
        fullName: "Alex Star",
        posGroup: "F",
        nhlPos: ["C"],
        nhlTeam: ["TOR"],
        capHit: 7_500_000,
        expiryDate: "2028-06-30",
        note: "Looking for a pick.",
        team: { name: "Diamonds" },
      },
    ]),
    [
      "*GSHL Trade Block*",
      "_1 player available from 1 team_",
      "*Alex Star — Diamonds*\nC · TOR\nCap hit: $7.500 M · Through 2028\nGM note: Looking for a pick.",
    ].join("\n\n"),
  );
});

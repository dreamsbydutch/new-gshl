import assert from "node:assert/strict";
import test from "node:test";
import type { BuildWeeklyEditionFactPacketInput } from "@gshl-types";
import {
  buildWeeklyEditionCareerRecordFacts,
  buildMilestoneEditionFactPacket,
  buildTemplateWeeklyEdition,
  buildWeeklyEditionCategoryMargins,
  buildWeeklyEditionChatGptPrompt,
  buildWeeklyEditionFactPacket,
  buildWeeklyEditionMilestoneFacts,
  buildWeeklyEditionMilestoneSchedule,
  buildWeeklyEditionPeriodRecordFacts,
  hashWeeklyEditionSource,
  isWeeklyEditionPlayingContract,
  validateWeeklyEditionImport,
  weeklyEditionContractAffectsSeason,
} from "./weekly-edition";

function source(): BuildWeeklyEditionFactPacketInput {
  return {
    season: { id: "season-1", name: "2026 GSHL", year: "2026" },
    week: {
      id: "week-7",
      number: 7,
      startDate: "2026-01-05",
      endDate: "2026-01-11",
    },
    teams: [
      { teamId: "team-a", name: "Aurora", abbr: "AUR" },
      { teamId: "team-b", name: "Bears", abbr: "BEA" },
      { teamId: "team-c", name: "Comets", abbr: "COM" },
      { teamId: "team-d", name: "Dragons", abbr: "DRA" },
    ],
    matchups: [
      {
        matchupId: "matchup-1",
        homeTeamId: "team-a",
        homeTeamName: "Aurora",
        awayTeamId: "team-b",
        awayTeamName: "Bears",
        homeScore: 7,
        awayScore: 5,
        homeRank: 8,
        awayRank: 2,
        competitiveRating: 4,
        winnerTeamId: undefined,
        winnerTeamName: undefined,
        loserTeamId: undefined,
        loserTeamName: undefined,
        categoryMargins: [],
      },
      {
        matchupId: "matchup-2",
        homeTeamId: "team-c",
        homeTeamName: "Comets",
        awayTeamId: "team-d",
        awayTeamName: "Dragons",
        homeScore: 6,
        awayScore: 5,
        homeRank: 3,
        awayRank: 4,
        competitiveRating: 10,
        winnerTeamId: undefined,
        winnerTeamName: undefined,
        loserTeamId: undefined,
        loserTeamName: undefined,
        categoryMargins: [],
      },
    ],
    players: [
      {
        playerId: "player-1",
        playerName: "Alex North",
        teamId: "team-a",
        teamName: "Aurora",
        rating: "9.4",
        points: "8",
        wins: 0,
      },
      {
        playerId: "player-2",
        playerName: "Blake West",
        teamId: "team-b",
        teamName: "Bears",
        rating: 8.9,
        points: 4,
        wins: 2,
      },
      {
        playerId: "player-3",
        playerName: "Casey East",
        teamId: "team-c",
        teamName: "Comets",
        rating: 8.2,
        points: 5,
        wins: 0,
      },
    ],
    power: [
      {
        teamId: "team-a",
        teamName: "Aurora",
        currentRank: 3,
        previousRank: 7,
        currentElo: 1510,
        previousElo: 1480,
      },
      {
        teamId: "team-b",
        teamName: "Bears",
        currentRank: 6,
        previousRank: 2,
        currentElo: 1488,
        previousElo: 1512,
      },
    ],
    activity: [
      {
        id: "add-1",
        kind: "add",
        date: "2026-01-07",
        playerName: "Devon South",
        teamName: "Dragons",
      },
    ],
    missedStarts: [
      {
        id: "missed-1",
        date: "2026-01-08",
        playerName: "Blake West",
        teamName: "Bears",
        count: 1,
      },
    ],
    nextMatchups: [
      {
        matchupId: "matchup-3",
        homeTeamName: "Bears",
        awayTeamName: "Comets",
        homeRank: 6,
        awayRank: 3,
      },
    ],
  };
}

void test("selects the largest rank upset before competitiveness", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  assert.equal(packet.heroMatchupId, "matchup-1");
  assert.equal(packet.matchups[0]?.rankUpset, 6);
  assert.deepEqual(
    packet.stars.map((star) => star.playerName),
    ["Alex North", "Blake West", "Casey East"],
  );
  assert.equal(packet.powerMovers[0]?.rankChange, 4);
});

void test("falls back to competitiveness when no matchup is an upset", () => {
  const input = source();
  const packet = buildWeeklyEditionFactPacket({
    ...input,
    matchups: input.matchups.map((matchup) => ({
      ...matchup,
      homeRank: 1,
      awayRank: 8,
    })),
  });
  assert.equal(packet.heroMatchupId, "matchup-2");
});

void test("handles ties and inverse goalie categories", () => {
  const margins = buildWeeklyEditionCategoryMargins({
    categories: ["G", "GAA"],
    homeTeamName: "Aurora",
    awayTeamName: "Bears",
    homeStats: { G: 12, GAA: 2.1 },
    awayStats: { G: 9, GAA: 3.4 },
  });
  assert.equal(
    margins.find((margin) => margin.category === "GAA")?.winnerTeamName,
    "Aurora",
  );
  assert.equal(
    margins.find((margin) => margin.category === "G")?.winnerTeamName,
    "Aurora",
  );

  const input = source();
  const packet = buildWeeklyEditionFactPacket({
    ...input,
    matchups: [
      {
        ...input.matchups[0]!,
        homeScore: 6,
        awayScore: 6,
        categoryMargins: margins,
      },
    ],
  });
  assert.equal(packet.matchups[0]?.winnerTeamName, undefined);
});

void test("template generation is varied but deterministic and activity-aware", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  assert.deepEqual(
    buildTemplateWeeklyEdition(packet),
    buildTemplateWeeklyEdition(packet),
  );
  assert.ok(
    buildTemplateWeeklyEdition(packet).sections.some(
      (section) => section.kind === "transaction_wire",
    ),
  );
  assert.ok(
    buildTemplateWeeklyEdition(packet).sections.some(
      (section) => section.kind === "missed_start",
    ),
  );
  assert.equal(
    hashWeeklyEditionSource(packet),
    hashWeeklyEditionSource(packet),
  );
});

void test("lets records and elite performances compete for the weekly lead", () => {
  const packet = buildWeeklyEditionFactPacket({
    ...source(),
    performances: [
      {
        id: "player-day-elite",
        entityType: "player",
        scope: "day",
        occurredAt: "2026-01-08",
        playerId: "player-1",
        playerName: "Alex North",
        teamId: "team-a",
        teamName: "Aurora",
        rating: 91.2,
        stats: { G: 3, P: 5 },
      },
    ],
    records: [
      {
        id: "career-points-record",
        entityType: "player",
        recordScope: "league",
        period: "career",
        playerId: "player-1",
        playerName: "Alex North",
        franchiseId: "franchise-a",
        franchiseName: "Aurora",
        metric: {
          key: "P",
          label: "Points",
          value: 401,
          previousValue: 399,
        },
      },
    ],
  });

  assert.equal(packet.editorialCandidates[0]?.kind, "record");
  assert.ok(
    packet.editorialCandidates.some(
      (candidate) =>
        candidate.kind === "player_performance" &&
        candidate.metrics.some(
          (metric) => metric.key === "Rating" && metric.value === 91.2,
        ),
    ),
  );
  const content = buildTemplateWeeklyEdition(packet);
  assert.match(content.headline, /record/);
  assert.match(buildWeeklyEditionChatGptPrompt(packet), /career-points-record/);
});

void test("detects newly crossed period, career, and franchise milestones", () => {
  const periodRecords = buildWeeklyEditionPeriodRecordFacts({
    current: [
      {
        id: "current-team-week",
        entityType: "team",
        period: "week",
        periodId: "week-7",
        teamId: "team-a",
        teamName: "Aurora",
        franchiseId: "franchise-a",
        franchiseName: "Aurora",
        metrics: { G: 26 },
      },
    ],
    historical: [
      {
        id: "old-team-week",
        entityType: "team",
        period: "week",
        periodId: "week-old",
        teamId: "team-b",
        teamName: "Bears",
        franchiseId: "franchise-b",
        franchiseName: "Bears",
        metrics: { G: 25 },
      },
    ],
    metricLabels: { G: "Goals" },
  });
  assert.equal(periodRecords[0]?.recordScope, "league");
  assert.equal(periodRecords[0]?.metric.previousValue, 25);

  const careerRecords = buildWeeklyEditionCareerRecordFacts({
    snapshots: [
      {
        id: "alex-career",
        entityType: "player",
        period: "career",
        periodId: "career",
        playerId: "player-1",
        playerName: "Alex North",
        franchiseId: "franchise-a",
        franchiseName: "Aurora",
        metrics: { P: 101 },
        deltaMetrics: { P: 2 },
      },
      {
        id: "blake-career",
        entityType: "player",
        period: "career",
        periodId: "career",
        playerId: "player-2",
        playerName: "Blake West",
        franchiseId: "franchise-b",
        franchiseName: "Bears",
        metrics: { P: 100 },
        deltaMetrics: { P: 0 },
      },
    ],
    metricLabels: { P: "Points" },
    recordScopes: ["league"],
  });
  assert.equal(careerRecords[0]?.playerName, "Alex North");
  assert.equal(careerRecords[0]?.metric.previousValue, 100);

  const milestones = buildWeeklyEditionMilestoneFacts([
    {
      id: "franchise-a",
      teamId: "team-a",
      teamName: "Aurora",
      franchiseId: "franchise-a",
      franchiseName: "Aurora",
      metrics: {
        all_time_wins: 50,
        conference_wins: 29,
        playoff_wins: 4,
        playoff_appearances: 1,
      },
      deltaMetrics: {
        all_time_wins: 1,
        conference_wins: 1,
        playoff_wins: 0,
        playoff_appearances: 1,
      },
    },
  ]);
  assert.deepEqual(
    milestones.map((milestone) => milestone.milestone),
    ["all_time_wins", "playoff_appearances"],
  );
});

void test("prompt contains only relevant edition facts and a compact section plan", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  packet.teams.push({
    teamId: "database-only-team",
    name: "Database Only Team",
    abbr: "DOT",
  });
  const prompt = buildWeeklyEditionChatGptPrompt(packet);
  assert.match(prompt, /EDITION_FACTS=/);
  assert.match(prompt, /SECTION_PLAN=/);
  assert.match(prompt, /Return only one JSON object/);
  assert.match(prompt, /Alex North/);
  assert.doesNotMatch(prompt, /Database Only Team/);
  assert.doesNotMatch(prompt, /knownEntityNames|allowedNames|allowedNumbers/);
});

void test("accepts a grounded response and rejects malformed JSON", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  const content = buildTemplateWeeklyEdition(packet);
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(content), packet).valid,
    true,
  );
  assert.equal(validateWeeklyEditionImport("{bad", packet).valid, false);
});

void test("rejects HTML, altered structure, invented links, and oversized text", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  const content = buildTemplateWeeklyEdition(packet);
  const html = structuredClone(content);
  html.sections[0]!.body = "<b>Aurora</b> won.";
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(html), packet).valid,
    false,
  );

  const unknownSection = structuredClone(content);
  unknownSection.sections[0]!.id = "rumour_mill";
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(unknownSection), packet).valid,
    false,
  );

  const reordered = structuredClone(content);
  [reordered.sections[0], reordered.sections[1]] = [
    reordered.sections[1]!,
    reordered.sections[0]!,
  ];
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(reordered), packet).valid,
    false,
  );

  const alteredEyebrow = structuredClone(content);
  alteredEyebrow.sections[0]!.eyebrow = "Rumour Mill";
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(alteredEyebrow), packet).valid,
    false,
  );

  const inventedLink = structuredClone(content);
  inventedLink.sections[0]!.links = [
    { label: "Elsewhere", href: "https://example.com" },
  ];
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(inventedLink), packet).valid,
    false,
  );

  const oversized = structuredClone(content);
  oversized.deck = "x".repeat(241);
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(oversized), packet).valid,
    false,
  );
});

void test("builds each season milestone from contract, cap, draft, and roster facts", () => {
  const issueTypes = [
    "final_recap",
    "resigning_outlook",
    "offseason_market",
    "pre_draft",
    "preseason",
  ] as const;

  for (const issueType of issueTypes) {
    const packet = buildMilestoneEditionFactPacket({
      issueType,
      issueLabel: issueType.replaceAll("_", " "),
      triggerDate: "2026-10-04",
      analysisSeason: {
        id: "season-2",
        name: "2026-27 GSHL",
        signingEndDate: "2026-06-30",
        draftStartAt: "2026-10-03T23:00:00.000Z",
      },
      season: {
        id: "season-1",
        name: "2026 GSHL",
        year: "2026",
        endDate: "2026-04-20",
        signingEndDate: "2026-06-30",
        draftStartAt: "2026-10-03T23:00:00.000Z",
      },
      week: {
        id: "week-20",
        number: 20,
        startDate: "2026-04-13",
        endDate: "2026-04-20",
      },
      teams: source().teams,
      matchups: source().matchups,
      stars: source().players,
      power: source().power,
      teamOutlooks: [
        {
          teamId: "team-a",
          teamName: "Aurora",
          capSpace: 8_000_000,
          committedSalary: 17_000_000,
          rosterSize: 18,
          rosterTalent: 87.4,
          expiringCount: 2,
          draftPickCount: 5,
          firstRoundPickCount: 2,
        },
        {
          teamId: "team-b",
          teamName: "Bears",
          capSpace: 3_000_000,
          committedSalary: 22_000_000,
          rosterSize: 20,
          rosterTalent: 82.1,
          expiringCount: 1,
          draftPickCount: 3,
          firstRoundPickCount: 1,
        },
      ],
      expiringContracts: [
        {
          contractId: "contract-1",
          playerName: "Alex North",
          teamName: "Aurora",
          salary: 5_000_000,
          expiryStatus: "UFA",
          expiryDate: "2026-04-20",
        },
      ],
      recentSignings: [
        {
          contractId: "contract-2",
          playerName: "Blake West",
          teamName: "Bears",
          salary: 4_000_000,
          expiryStatus: "RFA",
          expiryDate: "2028-04-20",
        },
      ],
      draftPicks: [
        {
          pickId: "pick-1",
          teamName: "Aurora",
          round: 1,
          pick: 2,
          selectedPlayerName: "Casey East",
        },
      ],
    });
    const content = buildTemplateWeeklyEdition(packet);
    assert.equal(packet.issueType, issueType);
    assert.ok(content.sections.length >= 5);
    if (issueType !== "final_recap") {
      assert.match(
        `${content.headline} ${content.deck} ${content.sections
          .map((section) => section.body)
          .join(" ")}`,
        /2026-27 GSHL/,
      );
    }
    const prompt = buildWeeklyEditionChatGptPrompt(packet);
    if (issueType === "final_recap") {
      assert.match(prompt, /completedSeason/);
      assert.doesNotMatch(prompt, /analysisSeason/);
    } else {
      assert.match(prompt, /"analysisSeason"/);
      assert.match(prompt, /2026-27 GSHL/);
    }
    if (issueType === "resigning_outlook") {
      assert.match(prompt, /expiringContracts/);
      assert.doesNotMatch(prompt, /draftPicks|recentSignings/);
    }
    if (issueType === "pre_draft") {
      assert.match(prompt, /draftPicks/);
      assert.doesNotMatch(prompt, /expiringContracts|finalMatchups/);
    }
    const validation = validateWeeklyEditionImport(
      JSON.stringify(content),
      packet,
    );
    assert.deepEqual(validation.errors, [], issueType);
  }
});

void test("uses upcoming-season contract coverage for offseason roster and cap facts", () => {
  const completedSeason = {
    id: "season-2025",
    year: "2025",
    startDate: "2025-10-01",
    endDate: "2026-04-20",
  };
  const upcomingSeason = {
    id: "season-2026",
    year: "2026",
    startDate: "2026-10-01",
    endDate: "2027-04-20",
  };
  const seasons = [completedSeason, upcomingSeason];
  const signedForUpcomingSeason = {
    seasonId: completedSeason.id,
    contractLength: 1,
    startDate: "2026-10-01",
    expiryDate: "2027-04-20",
    contractType: "STANDARD",
    expiryStatus: "UFA",
  };
  const expiringAfterCompletedSeason = {
    seasonId: "season-2024",
    contractLength: 1,
    startDate: "2025-10-01",
    expiryDate: "2026-04-20",
    contractType: "STANDARD",
    expiryStatus: "UFA",
  };
  const upcomingBuyout = {
    ...signedForUpcomingSeason,
    expiryStatus: "Buyout",
  };

  assert.equal(
    weeklyEditionContractAffectsSeason(
      signedForUpcomingSeason,
      upcomingSeason,
      seasons,
    ),
    true,
  );
  assert.equal(
    weeklyEditionContractAffectsSeason(
      signedForUpcomingSeason,
      completedSeason,
      seasons,
    ),
    false,
  );
  assert.equal(
    weeklyEditionContractAffectsSeason(
      expiringAfterCompletedSeason,
      upcomingSeason,
      seasons,
    ),
    false,
  );
  assert.equal(isWeeklyEditionPlayingContract(signedForUpcomingSeason), true);
  assert.equal(isWeeklyEditionPlayingContract(upcomingBuyout), false);

  const legacyContractWithoutDates = {
    seasonId: completedSeason.id,
    contractLength: 1,
    contractType: "EXTENSION",
    expiryStatus: "RFA",
  };
  assert.equal(
    weeklyEditionContractAffectsSeason(
      legacyContractWithoutDates,
      upcomingSeason,
      seasons,
    ),
    true,
  );
});

void test("schedules the season editorial calendar from league dates", () => {
  assert.deepEqual(
    buildWeeklyEditionMilestoneSchedule({
      finalWeekEnd: "2026-04-20",
      signingEndDate: "2026-06-30",
      draftStartAt: "2026-10-03T23:00:00.000Z",
    }).map(({ issueType, scheduledFor }) => [issueType, scheduledFor]),
    [
      ["final_recap", "2026-04-20"],
      ["resigning_outlook", "2026-04-27"],
      ["offseason_market", "2026-06-30"],
      ["pre_draft", "2026-09-26"],
      ["preseason", "2026-10-04"],
    ],
  );
});

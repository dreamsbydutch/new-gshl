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
  filterWeeklyEditionContent,
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
      {
        teamId: "team-a",
        name: "Aurora",
        abbr: "AUR",
        conferenceId: "east",
        conferenceName: "Crystal",
        beatWriter: "Gord McKenzie",
        leadReporter: "Bruce McAllister",
      },
      {
        teamId: "team-b",
        name: "Bears",
        abbr: "BEA",
        conferenceId: "east",
        conferenceName: "Crystal",
        beatWriter: "Darren Whitmore",
        leadReporter: "Bruce McAllister",
      },
      {
        teamId: "team-c",
        name: "Comets",
        abbr: "COM",
        conferenceId: "west",
        conferenceName: "Diamond",
        beatWriter: "Scott Callahan",
        leadReporter: "Ken Brodie",
      },
      {
        teamId: "team-d",
        name: "Dragons",
        abbr: "DRA",
        conferenceId: "west",
        conferenceName: "Diamond",
        beatWriter: "Mike Bouchard",
        leadReporter: "Ken Brodie",
      },
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

void test("prioritizes playoff rounds and removes Loser Tournament coverage", () => {
  const input = source();
  const packet = buildWeeklyEditionFactPacket({
    ...input,
    matchups: [
      { ...input.matchups[0]!, gameType: "LT" },
      { ...input.matchups[1]!, gameType: "QF" },
    ],
    nextMatchups: input.nextMatchups.map((matchup) => ({
      ...matchup,
      gameType: "LT",
    })),
  });

  assert.equal(packet.heroMatchupId, "matchup-2");
  assert.ok(
    packet.editorialCandidates.some(
      (candidate) => candidate.id === "matchup:matchup-2",
    ),
  );
  assert.ok(
    packet.editorialCandidates.every(
      (candidate) => candidate.id !== "matchup:matchup-1",
    ),
  );

  packet.editorialCandidates.unshift({
    id: "matchup:matchup-1",
    kind: "matchup",
    scope: "week",
    importance: 100,
    headlineHint: "Loser Tournament result",
    summary: "A stale candidate from an older fact packet.",
    metrics: [],
    links: [{ label: "Open matchup", href: "/matchup/matchup-1" }],
  });
  const content = buildTemplateWeeklyEdition(packet);
  const roundup = content.sections.find(
    (section) => section.kind === "matchup_roundup",
  );
  assert.match(roundup?.body ?? "", /Quarterfinal:/);
  assert.doesNotMatch(roundup?.body ?? "", /Aurora|Bears/);
  assert.doesNotMatch(content.headline, /Loser Tournament/);

  const prompt = buildWeeklyEditionChatGptPrompt(packet);
  assert.doesNotMatch(prompt, /"matchupId": "matchup-1"/);
  assert.doesNotMatch(prompt, /"id": "matchup:matchup-1"/);
  assert.doesNotMatch(prompt, /"matchupId": "matchup-3"/);
  assert.match(prompt, /QF means quarterfinal/);
  assert.match(prompt, /Loser Tournament games should not be a headline/);
});

void test("does not select a hero when a week contains only Loser Tournament games", () => {
  const input = source();
  const packet = buildWeeklyEditionFactPacket({
    ...input,
    matchups: input.matchups.map((matchup) => ({
      ...matchup,
      gameType: "LT",
    })),
  });

  assert.equal(packet.heroMatchupId, undefined);
  assert.ok(
    packet.editorialCandidates.every(
      (candidate) => candidate.kind !== "matchup",
    ),
  );
  assert.match(buildWeeklyEditionChatGptPrompt(packet), /"matchups": \[\]/);
});

void test("orders playoff previews and excludes upcoming Loser Tournament games", () => {
  const input = source();
  const packet = buildWeeklyEditionFactPacket({
    ...input,
    activity: [],
    missedStarts: [],
    nextMatchups: [
      {
        matchupId: "next-lt",
        gameType: "LT",
        awayTeamName: "Aurora",
        homeTeamName: "Bears",
      },
      {
        matchupId: "next-qf",
        gameType: "QF",
        awayTeamName: "Comets",
        homeTeamName: "Dragons",
      },
      {
        matchupId: "next-final",
        gameType: "F",
        awayTeamName: "Bears",
        homeTeamName: "Comets",
      },
    ],
  });
  const preview = buildTemplateWeeklyEdition(packet).sections.find(
    (section) => section.kind === "next_week",
  );

  assert.match(preview?.body ?? "", /^Final:/);
  assert.match(preview?.body ?? "", /Quarterfinal:/);
  assert.doesNotMatch(preview?.body ?? "", /Aurora at Bears/);
  const prompt = buildWeeklyEditionChatGptPrompt(packet);
  assert.ok(prompt.indexOf("next-final") < prompt.indexOf("next-qf"));
  assert.doesNotMatch(prompt, /next-lt/);
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
  assert.match(prompt, /^PROMPT_FORMAT=editorial_context_v4/);
  assert.match(prompt, /EDITION_FACTS=/);
  assert.match(prompt, /SECTION_PLAN=/);
  assert.match(prompt, /Return only one JSON object/);
  assert.match(prompt, /Alex North/);
  assert.match(prompt, /Graham MacIntyre/);
  assert.match(prompt, /Evan Soderberg/);
  assert.match(prompt, /Nate Carlson/);
  assert.match(prompt, /Darren Leclair/);
  assert.match(prompt, /Mike Halvorsen/);
  assert.match(prompt, /Every article must have a different reporter/);
  assert.match(
    prompt,
    /team beat writer appears only when the article is specifically centered/,
  );
  assert.match(prompt, /Create original storylines from the supplied facts/);
  assert.match(
    prompt,
    /Creative framing may be invented; factual claims may not/,
  );
  assert.match(prompt, /must never exceed 90/);
  assert.match(prompt, /Each section body should be 450–750/);
  assert.match(prompt, /Bruce McAllister|Gord McKenzie|Darren Whitmore/);
  assert.match(prompt, /Every expired UFA automatically returns to the draft/);
  assert.match(prompt, /exactly 115% of the prior salary/);
  assert.doesNotMatch(prompt, /Database Only Team/);
  assert.doesNotMatch(prompt, /knownEntityNames|allowedNames|allowedNumbers/);
});

void test("accepts a grounded response and rejects malformed JSON", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  const content = buildTemplateWeeklyEdition(packet);
  assert.ok(content.sections.every((section) => section.author));
  const authorNames = content.sections.map((section) => section.author?.name);
  assert.equal(new Set(authorNames).size, content.sections.length);
  assert.equal(
    content.sections.find((section) => section.kind === "three_stars")?.author
      ?.name,
    "Nate Carlson",
  );
  assert.equal(
    content.sections.find((section) => section.kind === "transaction_wire")
      ?.author?.name,
    "Mike Halvorsen",
  );
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(content), packet).valid,
    true,
  );
  assert.equal(validateWeeklyEditionImport("{bad", packet).valid, false);
});

void test("rotates six unique bylines between editions", () => {
  const first = buildTemplateWeeklyEdition(
    buildWeeklyEditionFactPacket(source()),
  ).sections.map((section) => section.author?.name);
  const nextSource = source();
  const second = buildTemplateWeeklyEdition(
    buildWeeklyEditionFactPacket({
      ...nextSource,
      week: {
        ...nextSource.week,
        id: "week-8",
        number: 8,
        startDate: "2026-01-12",
        endDate: "2026-01-18",
      },
    }),
  ).sections.map((section) => section.author?.name);

  assert.equal(new Set(first).size, 6);
  assert.equal(new Set(second).size, 6);
  assert.notDeepEqual(first, second);
});

void test("uses team beat writers only for stories centered on their team", () => {
  let teamBylineCount = 0;
  for (let weekNumber = 1; weekNumber <= 20; weekNumber += 1) {
    const input = source();
    const content = buildTemplateWeeklyEdition(
      buildWeeklyEditionFactPacket({
        ...input,
        week: {
          ...input.week,
          id: `beat-week-${weekNumber}`,
          number: weekNumber,
        },
      }),
    );
    for (const item of content.sections) {
      if (item.author?.scope !== "team") continue;
      teamBylineCount += 1;
      assert.ok(
        ["biggest_story", "missed_start", "season_recap"].includes(item.kind),
      );
      assert.match(
        item.headline.toLowerCase(),
        new RegExp(item.author.teamName?.toLowerCase() ?? "$^"),
      );
    }
  }
  assert.ok(teamBylineCount > 0);
});

void test("reserves department heads for major primary stories", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  packet.editorialCandidates = [
    {
      id: "record-major",
      kind: "record",
      scope: "league",
      importance: 100,
      headlineHint: "Aurora resets the league record book",
      summary: "Aurora set a verified league record.",
      teamId: "team-a",
      teamName: "Aurora",
      metrics: [],
      links: [],
    },
  ];
  assert.equal(
    buildTemplateWeeklyEdition(packet).sections[0]?.author?.position,
    "Head of Analytics",
  );

  packet.editorialCandidates = [
    {
      id: "trade-major",
      kind: "transaction",
      scope: "week",
      importance: 82,
      headlineHint: "Aurora lands the week’s biggest trade",
      summary: "Aurora completed the week’s biggest verified trade.",
      teamId: "team-a",
      teamName: "Aurora",
      metrics: [],
      links: [],
    },
  ];
  assert.equal(
    buildTemplateWeeklyEdition(packet).sections[0]?.author?.position,
    "GSHL Head Insider",
  );
});

void test("filters inactive articles without mutating the stored edition", () => {
  const packet = buildWeeklyEditionFactPacket(source());
  const content = buildTemplateWeeklyEdition(packet);
  const hiddenId = content.sections[1]!.id;
  const visible = filterWeeklyEditionContent(content, [hiddenId]);

  assert.equal(
    visible.sections.some((section) => section.id === hiddenId),
    false,
  );
  assert.equal(content.sections.length, visible.sections.length + 1);
  assert.equal(
    content.sections.some((section) => section.id === hiddenId),
    true,
  );
});

void test("rejects unsafe structure and normalizes oversized AI copy", () => {
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

  const alteredAuthor = structuredClone(content);
  alteredAuthor.sections[0]!.author = {
    name: "Invented Reporter",
    position: "Beat Writer",
    scope: "league",
  };
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(alteredAuthor), packet).valid,
    false,
  );

  const duplicateAuthor = structuredClone(content);
  duplicateAuthor.sections[1]!.author = duplicateAuthor.sections[0]!.author;
  const duplicateResult = validateWeeklyEditionImport(
    JSON.stringify(duplicateAuthor),
    packet,
  );
  assert.equal(duplicateResult.valid, false);
  assert.ok(
    duplicateResult.errors.some((error) =>
      error.includes("cannot be assigned to more than one article"),
    ),
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
  oversized.headline = `${"A long headline ".repeat(10)}with a clean ending.`;
  oversized.deck = `${"A detailed deck sentence. ".repeat(15)}Final thought.`;
  oversized.sections = oversized.sections.map((section) => ({
    ...section,
    headline: `${"A long section headline ".repeat(8)}Ending.`,
    body: `${"A complete sentence about the verified story. ".repeat(35)}Final thought.`,
  }));
  const normalized = validateWeeklyEditionImport(
    JSON.stringify(oversized),
    packet,
  );
  assert.equal(normalized.valid, true);
  assert.ok((normalized.content?.headline.length ?? 0) <= 90);
  assert.ok((normalized.content?.deck.length ?? 0) <= 220);
  assert.ok(
    normalized.content?.sections.every(
      (section) => section.headline.length <= 90 && section.body.length <= 1000,
    ),
  );

  const promptLimitBody = structuredClone(content);
  promptLimitBody.sections[0]!.body = "x".repeat(1000);
  assert.equal(
    validateWeeklyEditionImport(JSON.stringify(promptLimitBody), packet).valid,
    true,
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
          draftPickCount: 15,
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
          draftPickCount: 15,
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
          canBeReSigned: false,
          returnsToDraft: true,
        },
        {
          contractId: "contract-rfa",
          playerName: "Casey East",
          teamName: "Aurora",
          salary: 4_000_000,
          expiryStatus: "RFA",
          expiryDate: "2026-04-20",
          canBeReSigned: true,
          requiredReSigningSalary: 4_600_000,
          returnsToDraft: false,
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
    assert.equal(content.sections.length, 6);
    assert.equal(
      new Set(content.sections.map((section) => section.author?.name)).size,
      6,
    );
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
      assert.match(
        content.sections.map((section) => section.body).join(" "),
        /automatically back to the draft/,
      );
      assert.match(
        content.sections.map((section) => section.body).join(" "),
        /115% of the prior \$4\.0M salary/,
      );
      assert.match(prompt, /"requiredReSigningSalary": 4600000/);
      assert.equal(
        content.sections.find((section) => section.kind === "next_week")?.author
          ?.position,
        "Editor-in-Chief",
      );
    }
    if (issueType === "offseason_market") {
      assert.deepEqual(
        content.sections.slice(0, 4).map((section) => section.kind),
        ["ufa_market", "cap_space", "roster_outlook", "draft_capital"],
      );
      assert.match(prompt, /OFFSEASON REVIEW PRIORITIES/);
      assert.match(
        prompt,
        /which draft-bound UFAs they could realistically afford/,
      );
      assert.match(prompt, /earlyDraftBoard/);
      assert.doesNotMatch(prompt, /draftPickCount/);
      assert.match(
        content.sections.find((section) => section.kind === "ufa_market")
          ?.body ?? "",
        /Aurora.*Alex North.*plausible draft-board target/,
      );
      assert.ok(
        content.sections.every((section) => section.author?.scope !== "team"),
      );
    }
    if (issueType === "pre_draft") {
      assert.match(prompt, /earlyDraftBoard/);
      assert.match(prompt, /Every team always has exactly 15 draft picks/);
      assert.doesNotMatch(prompt, /draftPickCount/);
      assert.doesNotMatch(prompt, /expiringContracts|finalMatchups/);
      assert.doesNotMatch(
        `${content.headline} ${content.deck} ${content.sections
          .map((section) => `${section.headline} ${section.body}`)
          .join(" ")}`,
        /15 picks|pick totals|extra selections|biggest stack/i,
      );

      const noConfirmedPicks = structuredClone(packet);
      noConfirmedPicks.milestone!.draftPicks = [];
      assert.equal(
        buildTemplateWeeklyEdition(noConfirmedPicks).headline,
        "The GSHL draft board is set",
      );
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

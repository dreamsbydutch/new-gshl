import assert from "node:assert/strict";
import test from "node:test";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";
import {
  scan,
  finish,
  expire,
  forMatchup,
  evidence,
  generate,
  cleanup,
} from "./matchupPreviews";
import type { ActionCtx } from "./_generated/server";
import type { MatchupCategoryComparison } from "../src/lib/types/matchup-preview-article";
import { getFunctionName } from "convex/server";

const NOW = Date.parse("2026-10-01T08:00:00Z");
const START = Date.parse("2026-10-04T07:00:00Z");
const EXPIRY = Date.parse("2026-10-07T04:00:00Z");
function fixture() {
  const f = mutationFixture();
  f.put("weeks", "week", {
    seasonId: "season",
    startDate: Date.parse("2026-10-04"),
    endDate: Date.parse("2026-10-10"),
  });
  f.put("matchups", "matchup", {
    seasonId: "season",
    weekId: "week",
    homeTeamId: "home",
    awayTeamId: "away",
    isComplete: false,
  });
  return f;
}
const article = {
  writer: "Team Reporter",
  headline: "A matchup to watch",
  paragraphs: ["First.", "Second."],
  evidence: [{ id: "roster", text: "Known roster" }],
};

void test("preview history reaches all 13 seasons and prefers actual matchup dates over import order", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const f = fixture();
  for (const side of ["home", "away"]) {
    f.put("franchises", `${side}-franchise`, {
      name: side,
      ownerId: `${side}-owner`,
      beatWriter: `${side} reporter`,
    });
    // Imported rows can arrive in any order, unrelated to season chronology.
    for (const year of [
      2023, 2022, 2021, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2024, 2025,
      2026,
    ]) {
      f.put("teams", `${side}-${year}`, {
        seasonId: `season-${year}`,
        franchiseId: `${side}-franchise`,
      });
    }
    f.put("teams", side, {
      seasonId: "season",
      franchiseId: `${side}-franchise`,
    });
  }
  for (let year = 2014; year <= 2026; year++) {
    f.put("weeks", `week-${year}`, { startDate: Date.parse(`${year}-03-01`) });
    f.put("matchups", `meeting-${year}`, {
      seasonId: `season-${year}`,
      weekId: `week-${year}`,
      homeTeamId: `home-${year}`,
      awayTeamId: `away-${year}`,
      homeWin: true,
      homeScore: 7,
      awayScore: 3,
    });
  }
  await invokeMutation(scan, f.ctx, {});
  const row = f.rows("matchupPreviews").find((item) => item.teamId === "home")!;
  const result = await invokeMutation(evidence, f.ctx, {
    id: row._id,
    attemptAt: NOW,
  });
  assert.ok(result && typeof result === "object" && "facts" in result);
  const facts = result.facts as { id: string; text: string }[];
  const history = JSON.parse(
    facts.find((fact) => fact.id === "head-to-head")!.text,
  ) as {
    meetings: { date: string }[];
    totalRecordedMeetings: number;
    earliestRecordedMeeting: string;
  };
  assert.equal(history.meetings[0]?.date, "2026-03-01");
  assert.equal(history.meetings.length, 10);
  assert.equal(history.totalRecordedMeetings, 13);
  assert.equal(history.earliestRecordedMeeting, "2014-03-01");
  const form = JSON.parse(
    facts.find((fact) => fact.id === "team-form")!.text,
  ) as {
    recentCompletedMatchups: { date: string }[];
    latestHistoricalMatchups: { date: string }[];
  };
  assert.equal(form.latestHistoricalMatchups[0]?.date, "2026-03-01");
  assert.deepEqual(form.recentCompletedMatchups, []);
});

void test("overnight scan claims exactly one preview per team and preserves published articles", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 2);
  assert.deepEqual(
    new Set(f.rows("matchupPreviews").map((row) => row.teamId)),
    new Set(["home", "away"]),
  );
  assert.equal(
    f.scheduled.filter((job) => job.args.attemptAt === NOW).length,
    1,
  );
  assert.equal(
    f.scheduled.filter((job) => job.delay === EXPIRY - NOW).length,
    2,
  );
  await invokeMutation(scan, f.ctx, {});
  assert.equal(
    f.scheduled.filter((job) => job.args.attemptAt === NOW).length,
    1,
  );
  const row = f.rows("matchupPreviews")[0]!;
  await invokeMutation(finish, f.ctx, { id: row._id, attemptAt: NOW, article });
  assert.equal(
    f.scheduled.filter((job) => job.args.attemptAt === NOW).length,
    2,
    "the opposing writer starts only after the first article has settled",
  );
  t.mock.timers.setTime(NOW + 86400000);
  await invokeMutation(scan, f.ctx, {});
  assert.equal(f.get(row._id)?.headline, article.headline);
  assert.equal(f.get(row._id)?.attemptAt, NOW);
  assert.equal(f.rows("matchupPreviews").length, 2);
  // One existing article must not prevent the other team's stale attempt retry.
  assert.equal(
    f
      .rows("matchupPreviews")
      .filter((item) => item.attemptAt === NOW + 86400000).length,
    1,
  );
});

void test("scan skips the other UTC cron slot, distant matchups and completed matchups", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW + 3600000 });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 0);
  t.mock.timers.setTime(NOW);
  f.put("weeks", "week", { startDate: Date.parse("2026-10-06") });
  await invokeMutation(scan, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 0);
  f.put("weeks", "week", { startDate: Date.parse("2026-10-04") });
  f.put("matchups", "matchup", {
    weekId: "week",
    homeTeamId: "home",
    awayTeamId: "away",
    homeWin: true,
  });
  await invokeMutation(scan, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 0);
});

void test("failed work retries overnight and stale generation cannot overwrite the new attempt", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  const row = f.rows("matchupPreviews")[0]!;
  await invokeMutation(finish, f.ctx, { id: row._id, attemptAt: NOW });
  assert.equal(f.get(row._id)?.status, "failed");
  assert.equal(
    f.scheduled.filter((job) => job.args.attemptAt === NOW).length,
    2,
    "the first writer failing must still release the opposing writer",
  );
  await invokeMutation(finish, f.ctx, { id: row._id, attemptAt: NOW });
  assert.equal(
    f.scheduled.filter((job) => job.args.attemptAt === NOW).length,
    2,
    "a stale finish must not schedule the opposing writer twice",
  );
  assert.deepEqual(
    await invokeMutation(forMatchup, f.ctx, { matchupId: "matchup" }),
    [],
  );
  t.mock.timers.setTime(NOW + 86400000);
  await invokeMutation(scan, f.ctx, {});
  await invokeMutation(finish, f.ctx, { id: row._id, attemptAt: NOW, article });
  assert.equal(f.get(row._id)?.status, "generating");
  await invokeMutation(finish, f.ctx, {
    id: row._id,
    attemptAt: NOW + 86400000,
    article,
  });
  assert.equal(f.get(row._id)?.status, "published");
});

void test("pregame copy stays through Tuesday night, but late generation cannot change it", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  const [first, second] = f.rows("matchupPreviews");
  await invokeMutation(finish, f.ctx, {
    id: first!._id,
    attemptAt: NOW,
    article,
  });
  const published = await invokeMutation(forMatchup, f.ctx, {
    matchupId: "matchup",
  });
  assert.ok(Array.isArray(published));
  assert.equal(published.length, 1);
  t.mock.timers.setTime(START);
  assert.deepEqual(
    await invokeMutation(forMatchup, f.ctx, { matchupId: "matchup" }),
    published,
  );
  // An expiry job scheduled by the old code must retain the published copy.
  await invokeMutation(expire, f.ctx, { id: first!._id });
  assert.equal(f.get(first!._id)?.expiresAt, EXPIRY);
  assert.equal(f.scheduled.at(-1)?.delay, EXPIRY - START);
  await invokeMutation(finish, f.ctx, {
    id: second!._id,
    attemptAt: NOW,
    article,
  });
  await invokeMutation(finish, f.ctx, {
    id: first!._id,
    attemptAt: NOW,
    article,
  });
  assert.equal(f.get(first!._id)?.status, "published");
  assert.equal(f.get(second!._id)?.status, "failed");
  assert.equal(f.get(second!._id)?.headline, undefined);
  assert.equal(
    await invokeMutation(evidence, f.ctx, { id: second!._id, attemptAt: NOW }),
    null,
  );
  t.mock.timers.setTime(Date.parse("2026-10-05T08:00:00Z"));
  await invokeMutation(scan, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 2);
  assert.equal(
    f.get(second!._id)?.status,
    "failed",
    "started matchups must not retry writing",
  );
  t.mock.timers.setTime(EXPIRY - 1);
  assert.deepEqual(
    await invokeMutation(forMatchup, f.ctx, { matchupId: "matchup" }),
    published,
  );
  t.mock.timers.setTime(EXPIRY);
  assert.deepEqual(
    await invokeMutation(forMatchup, f.ctx, { matchupId: "matchup" }),
    [],
  );
  await invokeMutation(expire, f.ctx, { id: first!._id });
  await invokeMutation(cleanup, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 0);
  await invokeMutation(finish, f.ctx, {
    id: second!._id,
    attemptAt: NOW,
    article,
  });
  assert.equal(f.rows("matchupPreviews").length, 0);
});

void test("moving the start later reschedules cleanup instead of deleting the article early", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  const row = f.rows("matchupPreviews")[0]!;
  await invokeMutation(finish, f.ctx, { id: row._id, attemptAt: NOW, article });
  f.put("weeks", "week", { startDate: Date.parse("2026-10-05") });
  t.mock.timers.setTime(START);
  await invokeMutation(expire, f.ctx, { id: row._id });
  assert.equal(f.get(row._id)?.status, "published");
  assert.equal(f.get(row._id)?.startsAt, START + 86400000);
  assert.equal(f.get(row._id)?.expiresAt, EXPIRY);
  f.put("weeks", "week", { startDate: Date.parse("2026-10-08") });
  t.mock.timers.setTime(EXPIRY);
  await invokeMutation(expire, f.ctx, { id: row._id });
  assert.equal(f.get(row._id)?.status, "published");
  assert.equal(f.get(row._id)?.expiresAt, Date.parse("2026-10-14T04:00:00Z"));
});

void test("bounded cleanup upgrades legacy rows without repeatedly scanning retained started matchups", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: START });
  const f = fixture();
  for (let index = 0; index < 101; index++)
    f.put("matchupPreviews", `legacy-${index}`, {
      matchupId: "matchup",
      teamId: "home",
      startsAt: START,
      status: "published",
      attemptAt: NOW,
      ...article,
      publishedAt: NOW,
    });
  await invokeMutation(cleanup, f.ctx, {});
  assert.equal(
    f.rows("matchupPreviews").filter((row) => row.expiresAt === EXPIRY).length,
    100,
  );
  assert.equal(f.scheduled.filter((job) => job.delay === 0).length, 1);
  await invokeMutation(cleanup, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 101);
  assert.equal(
    f.rows("matchupPreviews").filter((row) => row.expiresAt === EXPIRY).length,
    101,
  );
  assert.equal(
    f.scheduled.filter((job) => job.delay === 0).length,
    1,
    "retained rows must not trigger an endless cleanup loop",
  );
  t.mock.timers.setTime(EXPIRY);
  await invokeMutation(cleanup, f.ctx, {});
  await invokeMutation(cleanup, f.ctx, {});
  assert.equal(f.rows("matchupPreviews").length, 0);
});

void test("evidence uses the assigned writer, both current rosters, recent stats and franchise head-to-head history", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const f = fixture();
  for (const side of ["home", "away"]) {
    f.put("teams", side, {
      seasonId: "season",
      franchiseId: `${side}-franchise`,
    });
    f.put("franchises", `${side}-franchise`, {
      name: side,
      ownerId: `${side}-owner`,
      beatWriter: `${side} reporter`,
    });
    f.put("players", `${side}-player`, {
      ownerId: `${side}-owner`,
      fullName: `${side} star`,
      nhlTeam: ["TOR"],
      overallRk: 5,
      lineupPos: side === "home" ? "IR" : "C",
    });
    f.put("playerDayStatLines", `${side}-day`, {
      seasonId: "season",
      playerId: `${side}-player`,
      date: "2026-09-30",
      GP: 1,
      G: 2,
      P: 3,
    });
  }
  f.put("weeks", "past-week", {
    seasonId: "season",
    startDate: Date.parse("2026-09-20"),
    endDate: Date.parse("2026-09-26"),
  });
  for (const side of ["home", "away"]) {
    f.put("teamWeekStatLines", `${side}-past-stats`, {
      seasonId: "season",
      weekId: "past-week",
      gshlTeamId: side,
      GP: 20,
      G: side === "home" ? 12 : 8,
      HIT: side === "home" ? 20 : 40,
      GAA: side === "home" ? 2 : 3,
    });
    f.put("teamWeekStatLines", `${side}-future-stats`, {
      seasonId: "season",
      weekId: "week",
      gshlTeamId: side,
      GP: 20,
      G: 999,
    });
  }
  f.put("matchups", "past", {
    weekId: "past-week",
    homeTeamId: "home",
    awayTeamId: "away",
    homeWin: true,
    homeScore: 7,
    awayScore: 3,
  });
  await invokeMutation(scan, f.ctx, {});
  const row = f.rows("matchupPreviews").find((item) => item.teamId === "home")!;
  const result = await invokeMutation(evidence, f.ctx, {
    id: row._id,
    attemptAt: NOW,
  });
  assert.ok(
    result &&
      typeof result === "object" &&
      "writer" in result &&
      "facts" in result,
  );
  assert.equal(result.writer, "home reporter");
  const text = JSON.stringify(result.facts);
  assert.match(text, /head-to-head/);
  assert.match(text, /home star/);
  assert.match(text, /away star/);
  assert.match(text, /recentSevenDays/);
  assert.match(text, /IR/);
  assert.doesNotMatch(text, /email/);
  const facts = result.facts as { id: string; text: string }[];
  const form = JSON.parse(
    facts.find((fact) => fact.id === "team-form")!.text,
  ) as {
    recentCompletedMatchups: { date: string }[];
  };
  assert.equal(form.recentCompletedMatchups[0]?.date, "2026-09-20");
  const comparison = JSON.parse(
    facts.find((fact) => fact.id === "category-comparison")!.text,
  ) as MatchupCategoryComparison;
  assert.equal(comparison.basis, "completed_week");
  assert.equal(comparison.endDate, "2026-09-26");
  assert.equal(
    comparison.categories.find((category) => category.category === "G")!
      .homeValue,
    12,
  );
  assert.equal(
    comparison.categories.find((category) => category.category === "HIT")!
      .awayRank,
    1,
  );
  assert.equal(
    comparison.categories.find((category) => category.category === "GAA")!
      .homeRank,
    1,
  );
  assert.doesNotMatch(JSON.stringify(comparison), /999/);
  const opposing = f
    .rows("matchupPreviews")
    .find((item) => item.teamId === "away")!;
  await invokeMutation(finish, f.ctx, {
    id: opposing._id,
    attemptAt: NOW,
    article: { ...article, writer: "away reporter" },
  });
  const withOpposingCopy = await invokeMutation(evidence, f.ctx, {
    id: row._id,
    attemptAt: NOW,
  });
  assert.ok(
    withOpposingCopy &&
      typeof withOpposingCopy === "object" &&
      "opposingArticle" in withOpposingCopy,
  );
  assert.deepEqual(withOpposingCopy.opposingArticle, {
    writer: "away reporter",
    headline: article.headline,
    paragraphs: article.paragraphs,
  });
});

void test("publication rejects duplicated analysis from overlapping attempts without changing the first article", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  const [first, second] = f.rows("matchupPreviews");
  await invokeMutation(finish, f.ctx, {
    id: first!._id,
    attemptAt: NOW,
    article,
  });
  await invokeMutation(finish, f.ctx, {
    id: second!._id,
    attemptAt: NOW,
    article: { ...article, writer: "Opponent Reporter" },
  });
  assert.equal(f.get(first!._id)?.status, "published");
  assert.equal(f.get(second!._id)?.status, "failed");
  assert.equal(f.get(second!._id)?.headline, undefined);
});

void test("generation publishes validated copy under the assigned writer and rejects unsupported evidence", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  const packet = {
    writer: "Assigned Reporter",
    teamName: "Home",
    opponentName: "Away",
    startsAt: START,
    facts: [{ id: "roster", text: "Known roster" }],
  };
  const actionCtx = {
    runQuery: async () => packet,
    runMutation: async (_fn: unknown, args: Record<string, unknown>) =>
      invokeMutation(finish, f.ctx, args),
  } as unknown as ActionCtx;
  const run = (
    generate as unknown as {
      _handler: (
        ctx: ActionCtx,
        args: Record<string, unknown>,
      ) => Promise<void>;
    }
  )._handler;
  let evidenceId = "roster";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      status: "completed",
      output_text: JSON.stringify({
        headline: article.headline,
        paragraphs: article.paragraphs,
        evidenceIds: [evidenceId],
        prediction: { winner: "opponent", teamScore: 4, opponentScore: 6 },
      }),
    }),
  );
  const [first, second] = f.rows("matchupPreviews");
  await run(actionCtx, { id: first!._id, attemptAt: NOW });
  assert.equal(f.get(first!._id)?.status, "published");
  assert.equal(f.get(first!._id)?.writer, "Assigned Reporter");
  assert.deepEqual(f.get(first!._id)?.paragraphs, [
    ...article.paragraphs,
    "Prediction: Away defeats Home, 6–4.",
  ]);
  evidenceId = "invented";
  await run(actionCtx, { id: second!._id, attemptAt: NOW });
  assert.equal(f.get(second!._id)?.status, "failed");
  assert.equal(f.get(second!._id)?.headline, undefined);
});

void test("opposing beat writers may agree on the pick but cloned reasoning is rewritten", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  const f = fixture();
  await invokeMutation(scan, f.ctx, {});
  const rows = f.rows("matchupPreviews");
  const copied = [
    "Home has the stronger attack against Away. Its advantage in goals and shots gives it the best route to winning this matchup.",
    "Away needs to win the peripheral categories to stay close. Home should carry the scoring categories and take a narrow overall win.",
  ];
  const independent = [
    "Away can pressure Home through hits and blocks, which is the route this club should trust. That still leaves a difficult goaltending comparison.",
    "Home has the stronger goalie ratios. Away needs those ratios to swing before its physical edge becomes a winning argument; I expect it to fall short.",
  ];
  const ctx = {
    runQuery: async (_reference: unknown, args: { id: string }) => {
      const row = f.get(args.id)!;
      const home = row.teamId === "home";
      const counterpart = f
        .rows("matchupPreviews")
        .find(
          (other) =>
            other.teamId !== row.teamId && other.status === "published",
        );
      return {
        writer: home ? "Gord McKenzie" : "Tyler Beaulieu",
        teamName: home ? "Home" : "Away",
        opponentName: home ? "Away" : "Home",
        homeTeamName: "Home",
        startsAt: START,
        facts: [
          {
            id: "categories",
            text: "Home: stronger goals, shots and goalie ratios. Away: stronger hits and blocks.",
          },
        ],
        opposingArticle: counterpart
          ? {
              writer: counterpart.writer,
              headline: counterpart.headline,
              paragraphs: counterpart.paragraphs,
            }
          : undefined,
      };
    },
    runMutation: async (
      reference: Parameters<typeof getFunctionName>[0],
      args: Record<string, unknown>,
    ) => {
      assert.equal(getFunctionName(reference), "matchupPreviews:finish");
      return invokeMutation(finish, f.ctx, args);
    },
  } as unknown as ActionCtx;
  let calls = 0;
  let repeatOnly = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options: RequestInit) => {
      calls++;
      assert.ok(typeof options.body === "string");
      const request = JSON.parse(options.body) as { input: string };
      const packet = JSON.parse(request.input) as { teamName: string };
      return Response.json({
        status: "completed",
        output_text: JSON.stringify({
          headline: "The category battle",
          paragraphs: repeatOnly || calls <= 2 ? copied : independent,
          evidenceIds: ["categories"],
          prediction:
            packet.teamName === "Home"
              ? { winner: "team", teamScore: 6, opponentScore: 4 }
              : { winner: "opponent", teamScore: 4, opponentScore: 6 },
        }),
      });
    },
  );
  const run = (
    generate as unknown as {
      _handler: (
        ctx: ActionCtx,
        args: { id: string; attemptAt: number },
      ) => Promise<void>;
    }
  )._handler;
  for (const row of rows) await run(ctx, { id: row._id, attemptAt: NOW });
  assert.equal(
    calls,
    3,
    "a cloned second article needs one independent rewrite",
  );
  const first = f.get(rows[0]!._id)!;
  const second = f.get(rows[1]!._id)!;
  assert.equal(first.status, "published");
  assert.equal(second.status, "published");
  assert.notDeepEqual(first.paragraphs, second.paragraphs);
  assert.equal(
    (first.paragraphs as string[]).at(-1),
    (second.paragraphs as string[]).at(-1),
    "agreement is allowed when reasoning differs",
  );
  repeatOnly = true;
  f.put("matchupPreviews", second._id, {
    ...second,
    status: "generating",
    headline: undefined,
    paragraphs: undefined,
  });
  await run(ctx, { id: second._id, attemptAt: NOW });
  assert.equal(calls, 5, "a repeated clone gets at most one rewrite");
  assert.equal(f.get(second._id)?.status, "failed");
  assert.equal(f.get(second._id)?.headline, undefined);
  assert.equal(f.get(first._id)?.status, "published");
});

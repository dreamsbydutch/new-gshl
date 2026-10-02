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
} from "./matchupPreviews";
import type { ActionCtx } from "./_generated/server";

const NOW = Date.parse("2026-10-01T08:00:00Z");
const START = Date.parse("2026-10-04T07:00:00Z");
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
    2,
  );
  assert.equal(
    f.scheduled.filter((job) => job.delay === START - NOW).length,
    2,
  );
  await invokeMutation(scan, f.ctx, {});
  assert.equal(
    f.scheduled.filter((job) => job.args.attemptAt === NOW).length,
    2,
  );
  const row = f.rows("matchupPreviews")[0]!;
  await invokeMutation(finish, f.ctx, { id: row._id, attemptAt: NOW, article });
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

void test("public previews disappear at start, rows are deleted, and late generation cannot restore them", async (t) => {
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
    [],
  );
  await invokeMutation(expire, f.ctx, { id: first!._id });
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
  f.put("weeks", "past-week", { startDate: Date.parse("2026-09-20") });
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
      }),
    }),
  );
  const [first, second] = f.rows("matchupPreviews");
  await run(actionCtx, { id: first!._id, attemptAt: NOW });
  assert.equal(f.get(first!._id)?.status, "published");
  assert.equal(f.get(first!._id)?.writer, "Assigned Reporter");
  evidenceId = "invented";
  await run(actionCtx, { id: second!._id, attemptAt: NOW });
  assert.equal(f.get(second!._id)?.status, "failed");
  assert.equal(f.get(second!._id)?.headline, undefined);
});

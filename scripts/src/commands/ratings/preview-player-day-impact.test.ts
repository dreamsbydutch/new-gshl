import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { previewPlayerDayImpact } from "./preview-player-day-impact";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gshl-impact-preview-"));
  const context = (id: string, endDate: string) => ({
    matchupId: id,
    startDate: endDate.slice(0, 8) + "01",
    endDate,
    calendarDays: 7,
    categories: ["G"],
    home: {
      raw: { G: 2 },
      appearances: [{ role: "skater", raw: { G: 2 }, availableFields: ["G"] }],
    },
    away: {
      raw: { G: 0 },
      appearances: [{ role: "skater", raw: { G: 0 }, availableFields: ["G"] }],
    },
  });
  const rows = [
    {
      _id: "day",
      playerId: "player",
      weekId: "week",
      date: "2021-01-02",
      GP: "1",
      G: "1",
      posGroup: "F",
      dailyPos: "C",
      Rating: 999,
    },
  ];
  const contexts = {
    week: {
      startDate: "2021-01-01",
      endDate: "2021-01-07",
      categories: ["G"],
      weekDays: 7,
      goalieMinimum: 2,
    },
  };
  await writeFile(
    join(root, "corpus.json"),
    JSON.stringify({
      matchups: [
        context("old", "2018-01-07"),
        context("train", "2020-01-07"),
        context("cutoff", "2021-01-01"),
      ],
    }),
  );
  await writeFile(join(root, "rows.json"), JSON.stringify(rows));
  await writeFile(join(root, "contexts.json"), JSON.stringify(contexts));
  const args = [
    "--corpus",
    join(root, "corpus.json"),
    "--trained-before",
    "2021-01-01",
    "--rows",
    join(root, "rows.json"),
    "--contexts-by-week-id",
    join(root, "contexts.json"),
    "--output",
    join(root, "preview"),
  ];
  return { root, args, rows, contexts };
}

test("local preview binds cutoff/window inputs and replays serialized reference without changing stored rating", async () => {
  const { root, args } = await fixture();
  const manifest = await previewPlayerDayImpact([
    ...args,
    "--history-years",
    "2",
    "--weighting",
    "appearance",
    "--count-model",
    "normal",
    "--include-breakdown",
  ]);
  assert.ok(manifest);
  assert.deepEqual(manifest.counts, {
    candidateContexts: 3,
    trainingContexts: 1,
    excludedAtOrAfterCutoff: 1,
    excludedBeforeHistoryWindow: 1,
    previewRows: 1,
  });
  assert.equal(manifest.serializedReferenceScoringParity, true);
  const rows = JSON.parse(
    await readFile(join(root, "preview/preview-rows.json"), "utf8"),
  );
  assert.equal(rows[0].Rating, 999);
  assert.equal(typeof rows[0].dayImpactRating, "number");
  const model = JSON.parse(
    await readFile(join(root, "preview/fitted-reference.json"), "utf8"),
  );
  assert.equal(model.provenance.latestEndDate, "2020-01-07");
  await assert.rejects(previewPlayerDayImpact(args), /must be new/);
});

test("preview rejects populated unknown GP and references trained after the target week begins", async () => {
  const { root, args, rows, contexts } = await fixture();
  await writeFile(
    join(root, "rows.json"),
    JSON.stringify([{ ...rows[0], GP: null }]),
  );
  await assert.rejects(previewPlayerDayImpact(args), /GP is missing/);
  await writeFile(join(root, "rows.json"), JSON.stringify(rows));
  contexts.week.startDate = "2020-12-31";
  await writeFile(join(root, "contexts.json"), JSON.stringify(contexts));
  await assert.rejects(previewPlayerDayImpact(args), /frozen before the week/);
});

test("schedule preview supports a novel 28-day target without using future performances", async () => {
  const { root, args, contexts } = await fixture();
  const old = JSON.parse(await readFile(join(root, "corpus.json"), "utf8"));
  const training = { ...old.matchups[1], weekId: "history" };
  const future = {
    ...training,
    matchupId: "future",
    weekId: "week",
    startDate: "2021-01-01",
    endDate: "2021-01-28",
    calendarDays: 28,
    home: {
      raw: { G: 999999 },
      appearances: [
        { role: "skater", raw: { G: 999999 }, availableFields: ["G"] },
      ],
    },
  };
  const corpusBytes = JSON.stringify({ matchups: [training, future] });
  await writeFile(join(root, "corpus.json"), corpusBytes);
  contexts.week.endDate = "2021-01-28";
  contexts.week.weekDays = 28;
  await writeFile(join(root, "contexts.json"), JSON.stringify(contexts));
  const sidecar = {
    version: "owner-independent-nhl-calendar-exposure-v1",
    corpus: { sha256: createHash("sha256").update(corpusBytes).digest("hex") },
    weeks: [training, future].map((c) => ({
      weekId: c.weekId,
      startDate: c.startDate,
      endDate: c.endDate,
      meanGamesPerNhlTeam: c.weekId === "week" ? 4.8125 : 4.6875,
    })),
  };
  await writeFile(join(root, "schedule.json"), JSON.stringify(sidecar));
  const scheduleArgs = [
    ...args,
    "--context-model",
    "schedule-kernel",
    "--calendar-exposure",
    join(root, "schedule.json"),
    "--exposure-bandwidth",
    "0.3",
  ];
  const manifest = await previewPlayerDayImpact(scheduleArgs);
  assert.ok(manifest);
  assert.equal(manifest.counts.trainingContexts, 1);
  assert.equal(manifest.counts.excludedAtOrAfterCutoff, 1);
  assert.equal(manifest.modelProvenance.latestEndDate, "2020-01-07");
  assert.match(manifest.calendarExposureChronology!, /ex-post/);
  const preview = JSON.parse(
    await readFile(join(root, "preview/preview-rows.json"), "utf8"),
  );
  assert.equal(preview[0].dayImpactRating, 25);
  sidecar.corpus.sha256 = "0".repeat(64);
  await writeFile(join(root, "schedule.json"), JSON.stringify(sidecar));
  const wrongBindingArgs = [...scheduleArgs];
  wrongBindingArgs[wrongBindingArgs.indexOf("--output") + 1] = join(
    root,
    "rejected",
  );
  await assert.rejects(
    previewPlayerDayImpact(wrongBindingArgs),
    /exact supplied corpus/,
  );
});

test("completed-matchup impact stays separate from owner-independent performance rating", async () => {
  const { root, args, rows, contexts } = await fixture();
  const corpus = JSON.parse(await readFile(join(root, "corpus.json"), "utf8"));
  const app = (statLineId: string, playerId: string, G: number) => ({
    statLineId,
    playerId,
    date: "2021-01-02",
    role: "skater",
    raw: { G },
    availableFields: ["G"],
  });
  const pair = {
    matchupId: "actual",
    weekId: "week",
    ...contexts.week,
    calendarDays: 7,
    home: {
      teamId: "home",
      raw: { G: 1 },
      goalieStarts: 0,
      appearances: [app("day", "player", 1)],
    },
    away: {
      teamId: "away",
      raw: { G: 1 },
      goalieStarts: 0,
      appearances: [app("day-other", "other", 1)],
    },
  };
  const sourceRows = [
    { ...rows[0], gshlTeamId: "home" },
    {
      ...rows[0],
      _id: "day-other",
      playerId: "other",
      posGroup: "D",
      dailyPos: "D",
      gshlTeamId: "away",
    },
    {
      ...rows[0],
      _id: "bench",
      playerId: "bench",
      dailyPos: "BN",
      gshlTeamId: "home",
    },
  ];
  corpus.matchups.push(pair);
  await writeFile(join(root, "corpus.json"), JSON.stringify(corpus));
  await writeFile(join(root, "rows.json"), JSON.stringify(sourceRows));
  const options = [...args, "--include-actual-matchup-impact"];
  await previewPlayerDayImpact(options);
  const first = JSON.parse(
    await readFile(join(root, "preview/preview-rows.json"), "utf8"),
  );
  assert.deepEqual(
    first.map((r: { dayImpactRating: number }) => r.dayImpactRating),
    [25, 25, 25],
  );
  assert.equal(first[0].__ratingDebug.ifStarted, 0.25);
  assert.equal(first[0].__ratingDebug.actualMatchupImpact.ifStarted, 0.5);
  assert.deepEqual(first[2].__ratingDebug.actualMatchupImpact, {
    status: "not-counted",
    counted: 0,
  });
  pair.away.raw.G = 3;
  pair.away.appearances.push(app("peer", "peer", 2));
  await writeFile(join(root, "corpus.json"), JSON.stringify(corpus));
  const secondOptions = [...options];
  secondOptions[secondOptions.indexOf("--output") + 1] = join(
    root,
    "other-preview",
  );
  await previewPlayerDayImpact(secondOptions);
  const second = JSON.parse(
    await readFile(join(root, "other-preview/preview-rows.json"), "utf8"),
  );
  assert.deepEqual(
    second.map((r: { dayImpactRating: number }) => r.dayImpactRating),
    [25, 25, 25],
  );
  assert.equal(second[0].__ratingDebug.actualMatchupImpact.ifStarted, 0);
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "rows.json"), "utf8")),
    sourceRows,
  );
  assert.ok(second.every((r: { Rating: number }) => r.Rating === 999));
});

test("actual diagnostic rejects missing/duplicate identities, rule conflicts and hypothetical performances", async () => {
  const { root, args, rows, contexts } = await fixture();
  const corpus = JSON.parse(await readFile(join(root, "corpus.json"), "utf8"));
  const sourceRows = [{ ...rows[0], gshlTeamId: "home" }];
  const app = {
    statLineId: "day",
    playerId: "player",
    date: "2021-01-02",
    role: "skater",
    raw: { G: 1 },
    availableFields: ["G"],
  };
  const pair = {
    matchupId: "actual",
    weekId: "week",
    ...contexts.week,
    calendarDays: 7,
    home: {
      teamId: "home",
      raw: { G: 1 },
      goalieStarts: 0,
      appearances: [app],
    },
    away: { teamId: "away", raw: { G: 0 }, goalieStarts: 0, appearances: [] },
  };
  await writeFile(join(root, "rows.json"), JSON.stringify(sourceRows));
  const options = [...args, "--include-actual-matchup-impact"];
  await assert.rejects(
    previewPlayerDayImpact(options),
    /exact actual matchup week\/team/,
  );
  for (const badPairs of [
    [pair, pair],
    [{ ...pair, categories: ["A"] }],
    [{ ...pair, endDate: "2021-01-08" }],
    [{ ...pair, home: { ...pair.home, goalieStarts: 1 } }],
    [{ ...pair, home: { ...pair.home, teamId: "" } }],
    [
      {
        ...pair,
        home: {
          ...pair.home,
          appearances: [{ ...app, statLineId: "different" }],
        },
      },
    ],
    [
      {
        ...pair,
        home: { ...pair.home, appearances: [{ ...app, raw: { G: 2 } }] },
      },
    ],
  ]) {
    await writeFile(
      join(root, "corpus.json"),
      JSON.stringify({ matchups: [...corpus.matchups, ...badPairs] }),
    );
    await assert.rejects(previewPlayerDayImpact(options), /actual|Actual/);
  }
  const fallbackPair = {
    ...pair,
    home: { ...pair.home, appearances: [{ ...app, statLineId: undefined }] },
  };
  await writeFile(
    join(root, "corpus.json"),
    JSON.stringify({ matchups: [...corpus.matchups, fallbackPair] }),
  );
  assert.ok(await previewPlayerDayImpact(options));
  const missingPlayerOptions = [...options];
  missingPlayerOptions[missingPlayerOptions.indexOf("--output") + 1] = join(
    root,
    "missing-player",
  );
  await writeFile(
    join(root, "rows.json"),
    JSON.stringify([{ ...sourceRows[0], playerId: undefined }]),
  );
  await writeFile(
    join(root, "corpus.json"),
    JSON.stringify({
      matchups: [
        ...corpus.matchups,
        {
          ...fallbackPair,
          home: {
            ...fallbackPair.home,
            appearances: [
              { ...app, statLineId: undefined, playerId: undefined },
            ],
          },
        },
      ],
    }),
  );
  await assert.rejects(
    previewPlayerDayImpact(missingPlayerOptions),
    /actual source appearance/,
  );
});

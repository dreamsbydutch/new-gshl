import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { buildExpectedGoalInput } from "../../domains/nhl/expected-goal-input";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
  type NhlStatRow,
} from "../../domains/nhl/season-rating-input";
import { fetchNhlPenaltyReport } from "../../integrations/nhl/season-rating-source";
import { fetchExpectedGoalCsv } from "../../integrations/nhl/expected-goal-source";
import {
  compareRanks,
  spearman,
} from "../../domains/ranking/nhl-rating-diagnostics";
import { rankNhlSeason } from "../../runtime/nhl-season-rating";
import {
  NHL_VALUE_V2_CONFIG,
  prepareValueSeason,
  calibrateValueShrinkage,
  rankValueSeason,
  type PreparedValueSeason,
  type NhlValueV2Rating,
} from "../../runtime/nhl-season-value-v2";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    replay: { type: "boolean", default: false },
    season: { type: "string" },
    help: { type: "boolean" },
  },
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const writeJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
type Snapshot = {
  nhl: NhlRatingSource;
  skaters: string;
  goalies: string;
  penalties: NhlStatRow[];
  provenance: {
    attribution: string;
    nhlHash: string;
    penaltyHash: string;
    skaterHash: string;
    goalieHash: string;
    fetchedAt: string;
    urls: string[];
  };
};

if (values.help) {
  console.log(`Independent NHL v2 expected-goal preview; local output only, no database access.
  --input <directory>   Existing multi-season NHL report directory with summary.json
  --output <directory>  Required NEW directory for sources, ratings, CSV and comparison
  --season 20242025     Optional single season (defaults to all input seasons)
  --replay              Input is a previous v2 output; no network requests
Downloads official MoneyPuck season CSVs unless replaying. Credit: MoneyPuck.com.
Use all seasons together for expanding-window shrinkage calibration; a single-season run uses defaults.
No production publisher accepts this v2 report format.`);
} else {
  if (!values.input || !values.output)
    throw new Error("--input and --output required");
  const summary = JSON.parse(
    await readFile(resolve(values.input, "summary.json"), "utf8"),
  ) as { seasons: Array<{ nhlSeason: number; name: string }> };
  const seasons = summary.seasons
    .filter((s) => !values.season || String(s.nhlSeason) === values.season)
    .sort((a, b) => a.nhlSeason - b.nhlSeason);
  if (
    !seasons.length ||
    new Set(seasons.map((s) => s.nhlSeason)).size !== seasons.length
  )
    throw new Error("Empty/duplicate season scope");
  // Do not silently overwrite an earlier review artifact.
  await mkdir(resolve(values.output));
  const history: PreparedValueSeason[] = [];
  const results: Array<{
    nhlSeason: number;
    name: string;
    ratings: NhlValueV2Rating[];
  }> = [];
  const summaries = [];
  for (const season of seasons) {
    console.log(
      `Preparing ${season.name}: ${values.replay ? "offline replay" : "public expected-goal downloads"}`,
    );
    let snapshot: Snapshot;
    if (values.replay) {
      snapshot = JSON.parse(
        await readFile(
          resolve(values.input, String(season.nhlSeason), "source.json"),
          "utf8",
        ),
      ) as Snapshot;
      if (
        hash(snapshot.skaters) !== snapshot.provenance.skaterHash ||
        hash(snapshot.goalies) !== snapshot.provenance.goalieHash ||
        hash(JSON.stringify(snapshot.nhl)) !== snapshot.provenance.nhlHash ||
        hash(JSON.stringify(snapshot.penalties)) !==
          snapshot.provenance.penaltyHash
      )
        throw new Error("Source snapshot hash mismatch");
    } else {
      const nhl = JSON.parse(
        await readFile(
          resolve(values.input, String(season.nhlSeason), "source.json"),
          "utf8",
        ),
      ) as NhlRatingSource;
      const [skater, goalie, penalties] = await Promise.all([
        fetchExpectedGoalCsv(season.nhlSeason, nhl.gameType, "skaters"),
        fetchExpectedGoalCsv(season.nhlSeason, nhl.gameType, "goalies"),
        fetchNhlPenaltyReport(season.nhlSeason, nhl.gameType),
      ]);
      snapshot = {
        nhl,
        skaters: skater.text,
        goalies: goalie.text,
        penalties,
        provenance: {
          attribution:
            "MoneyPuck.com expected goals; NHL official identities, TOI and explicit penalties",
          nhlHash: hash(JSON.stringify(nhl)),
          penaltyHash: hash(JSON.stringify(penalties)),
          skaterHash: hash(skater.text),
          goalieHash: hash(goalie.text),
          fetchedAt: skater.fetchedAt,
          urls: [
            skater.url,
            goalie.url,
            `https://api.nhle.com/stats/rest/en/skater/penalties?cayenneExp=seasonId=${season.nhlSeason}%20and%20gameTypeId=${nhl.gameType}`,
          ],
        },
      };
      await delay(200);
    }
    if (snapshot.nhl.season !== season.nhlSeason)
      throw new Error("Snapshot season mismatch");
    const input = buildExpectedGoalInput(
      snapshot.nhl,
      snapshot.skaters,
      snapshot.goalies,
      snapshot.penalties,
    );
    if (history.some((h) => h.input.gameType !== input.gameType))
      throw new Error("Do not mix regular seasons and playoffs in one run");
    const prepared = prepareValueSeason(input);
    const calibration = calibrateValueShrinkage(
      history,
      season.nhlSeason,
      input.gameType,
    );
    const ratings = rankValueSeason(prepared, calibration);
    const v1 = rankNhlSeason(buildNhlRatingInput(snapshot.nhl));
    const sensitivity = [0, 1].map((weight) =>
      rankValueSeason(prepareValueSeason(input, weight), calibration),
    );
    const alternatives = sensitivity.map(
      (rows) => new Map(rows.map((p) => [p.playerId, p])),
    );
    for (const p of ratings) {
      if (p.seasonValue === null) continue;
      const options = [p, ...alternatives.map((rows) => rows.get(p.playerId)!)];
      const ranks = options.flatMap((r) => (r.rank === null ? [] : [r.rank]));
      p.contextSensitivity = {
        minimumValue: Math.min(...options.map((r) => r.seasonValue!)),
        maximumValue: Math.max(...options.map((r) => r.seasonValue!)),
        bestRank: ranks.length ? Math.min(...ranks) : null,
        worstRank: ranks.length ? Math.max(...ranks) : null,
      };
    }
    const diagnostics = (["F", "D", "G"] as const).map((position) => {
      const pool = ratings.filter(
        (p) => p.position === position && p.status === "rated",
      );
      const old = new Map(
        v1.filter((p) => p.status === "rated").map((p) => [p.playerId, p]),
      );
      const common = pool.filter((p) => old.has(p.playerId));
      const absolute = pool
        .flatMap((p) => p.components)
        .reduce((total, c) => total + Math.abs(c.value), 0);
      const names = [
        ...new Set(pool.flatMap((p) => p.components.map((c) => c.name))),
      ];
      return {
        position,
        rated: pool.length,
        comparisonWithV1: compareRanks(
          common.map((p) => old.get(p.playerId)!.seasonValue!),
          common.map((p) => p.seasonValue!),
        ),
        valueMinutesCorrelation: spearman(
          pool.map((p) => p.minutes),
          pool.map((p) => p.seasonValue!),
        ),
        componentShares: Object.fromEntries(
          names.map((name) => [
            name,
            absolute
              ? pool.reduce(
                  (t, p) =>
                    t +
                    Math.abs(
                      p.components.find((c) => c.name === name)?.value ?? 0,
                    ),
                  0,
                ) / absolute
              : 0,
          ]),
        ),
        contextSensitivity: sensitivity.map((alternate, i) => {
          const byId = new Map(alternate.map((p) => [p.playerId, p]));
          return {
            weight: i,
            ...compareRanks(
              pool.map((p) => p.seasonValue!),
              pool.map((p) => byId.get(p.playerId)!.seasonValue!),
            ),
          };
        }),
        leaders: pool
          .slice(0, 5)
          .map((p) => ({
            name: p.name,
            rank: p.rank,
            value: p.seasonValue,
            per60: p.impactPer60,
          })),
      };
    });
    const directory = resolve(values.output, String(season.nhlSeason));
    await mkdir(directory);
    await writeJson(resolve(directory, "source.json"), snapshot);
    await writeJson(resolve(directory, "ratings.json"), {
      version: NHL_VALUE_V2_CONFIG.version,
      season: season.nhlSeason,
      gameType: input.gameType,
      profile: "expected-goals",
      units: "estimated goal-equivalent contribution above average",
      config: NHL_VALUE_V2_CONFIG,
      provenance: snapshot.provenance,
      calibration,
      baselines: prepared.baselines,
      penaltyGoalCost: prepared.penaltyGoalCost,
      ratings,
    });
    const columns = [
      "playerId",
      "name",
      "team",
      "position",
      "games",
      "minutes",
      "modeledMinutes",
      "coverage",
      "sourceCoverage",
      "sourceGames",
      "status",
      "rank",
      "seasonRating",
      "seasonValue",
      "impactPer60",
      "observedValue",
      "goalieGsax",
    ] as const;
    await writeFile(
      resolve(directory, "ratings.csv"),
      [
        columns.join(","),
        ...ratings.map((p) =>
          columns
            .map((key) => `"${String(p[key] ?? "").replaceAll('"', '""')}"`)
            .join(","),
        ),
      ].join("\n") + "\n",
      { flag: "wx" },
    );
    const counts = {
      total: ratings.length,
      rated: ratings.filter((p) => p.status === "rated").length,
      provisional: ratings.filter((p) => p.status === "provisional").length,
      incomplete: ratings.filter((p) => p.status === "incomplete").length,
    };
    summaries.push({
      ...season,
      counts,
      fittedComponents: Object.keys(calibration).length,
      unmatchedProviderIds: input.unmatchedProviderIds,
      incomplete: ratings
        .filter((p) => p.status === "incomplete")
        .map((p) => ({
          id: p.playerId,
          name: p.name,
          minutes: p.minutes,
          missing: p.missing,
        })),
      diagnostics,
    });
    results.push({ ...season, ratings });
    history.push(prepared);
    console.log(
      JSON.stringify({
        season: season.name,
        counts,
        fittedComponents: Object.keys(calibration).length,
      }),
    );
  }
  // Prequential evaluation: each season's prior was selected before the next-season target.
  // These targets share the xG provider; this is repeatability evidence, not independent win validation.
  const errors: Record<
    string,
    {
      pairs: number;
      weightedError: number;
      rawError: number;
      zeroError: number;
      weight: number;
    }
  > = {};
  for (let i = 0; i < results.length - 1; i++) {
    const current = results[i]!,
      next = results[i + 1]!;
    if (
      next.nhlSeason - current.nhlSeason !== 10001 ||
      next.nhlSeason < 20202021
    )
      continue;
    const nextPlayers = new Map(
      next.ratings
        .filter((p) => p.status === "rated")
        .map((p) => [p.playerId, p]),
    );
    for (const p of current.ratings.filter((p) => p.status === "rated")) {
      const q = nextPlayers.get(p.playerId);
      if (!q || p.position !== q.position) continue;
      for (const o of p.components) {
        const n = q.components.find((v) => v.name === o.name);
        if (
          !n ||
          Math.min(o.exposure, n.exposure) <
            (p.position === "G"
              ? 300
              : o.name.includes("5on4") || o.name.includes("4on5")
                ? 30
                : 200)
        )
          continue;
        const key = `${p.position}:${o.name}`;
        const row = errors[key] ?? {
          pairs: 0,
          weightedError: 0,
          rawError: 0,
          zeroError: 0,
          weight: 0,
        };
        const weight = Math.min(n.exposure, p.position === "G" ? 2000 : 1000);
        row.pairs++;
        row.weight += weight;
        row.weightedError += weight * (o.rate * o.reliability - n.rate) ** 2;
        row.rawError += weight * (o.rate - n.rate) ** 2;
        row.zeroError += weight * n.rate ** 2;
        errors[key] = row;
      }
    }
  }
  const validation = Object.fromEntries(
    Object.entries(errors).map(([key, e]) => [
      key,
      {
        pairs: e.pairs,
        mse: e.weightedError / e.weight,
        rawMse: e.rawError / e.weight,
        zeroMse: e.zeroError / e.weight,
        improvementVsRaw: e.rawError ? 1 - e.weightedError / e.rawError : null,
        improvementVsZero: e.zeroError
          ? 1 - e.weightedError / e.zeroError
          : null,
      },
    ]),
  );
  await writeJson(resolve(values.output, "summary.json"), {
    version: NHL_VALUE_V2_CONFIG.version,
    completedAt: new Date().toISOString(),
    attribution: "MoneyPuck.com and NHL",
    seasons: summaries,
    validation,
  });
  console.log(
    `Saved ${seasons.length} seasons and chronological diagnostics to ${resolve(values.output)}`,
  );
}

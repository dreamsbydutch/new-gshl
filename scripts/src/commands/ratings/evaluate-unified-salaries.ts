import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  unifiedSalaryValues,
  rankUnifiedValues,
  type SalaryObjective,
} from "../../runtime/unified-salary-value";
import {
  fitMatchupProbability,
  matchupProbability,
} from "../../runtime/matchup-probability";
import { priorWeekRoster } from "../../domains/ranking/positional-evaluation-roster";
import type {
  PlayerProjection,
  Position,
  MatchupContext,
} from "../../runtime/positional-matchup-value";
import {
  expectedCategoryWins,
  expectedMatchupWin,
} from "../../runtime/positional-matchup-value";
import { spearman } from "../../domains/ranking/nhl-rating-diagnostics";
type Row = Record<string, any>;
const { values } = parseArgs({
  options: {
    forecasts: { type: "string" },
    history: { type: "string" },
    source: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help)
  console.log(
    "Offline unified F/D/G valuation. --forecasts <derived forecasts.json> --history <audited history directory> --source <draft source.json> --output <NEW directory>. Evaluates both opening and prior-week rosters, chronological calibration and real-player replacement bands. Produces one latest combined ranking and all candidates; never writes production.",
  );
else {
  if (!values.forecasts || !values.history || !values.source || !values.output)
    throw new Error("All paths required");
  await mkdir(values.output);
  const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
  const [forecast, history, source, directory] = await Promise.all([
    read(values.forecasts),
    read(resolve(values.history, "contexts.json")),
    read(values.source),
    read(resolve(values.history, "directory-linked.json")).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return read(resolve(values.history!, "directory.json"));
      },
    ),
  ]);
  const ids = new Map<number, string>(
    directory.players
      .filter((r: Row) => r.nhlApiId)
      .map((r: Row) => [Number(r.nhlApiId), r.id]),
  );
  if (ids.size < 1000)
    throw new Error("History directory lacks linked NHL identities");
  const years = new Map<string, number>(
    source.seasonRows.map((r: Row) => [r.id, Number(r.year)]),
  );
  const best = forecast.variants.find((r: Row) => r.method === "position-best")
      .predictions as Row[],
    development = new Map<string, Row>(
      forecast.variants
        .find((r: Row) => r.method === "age-usage")
        .predictions.map((r: Row) => [
          `${r.origin}:${r.horizon}:${r.playerId}`,
          r,
        ]),
    );
  const predictions = best.map((r) =>
    r.position === "F" && r.originGames < 40
      ? (development.get(`${r.origin}:${r.horizon}:${r.playerId}`) ?? r)
      : r,
  );
  const latestOrigin = Math.max(...predictions.map((r) => r.origin)),
    positions: Position[] = ["F", "D", "G"];
  const variants: {
    name: string;
    objective: SalaryObjective;
    slots: null | Record<Position, number>;
  }[] = [
    { name: "category-empirical", objective: "categories", slots: null },
    {
      name: "category-two-goalies",
      objective: "categories",
      slots: { F: 9, D: 4, G: 2 },
    },
    { name: "matchup-empirical", objective: "matchup", slots: null },
  ];
  const games: Row[] = [],
    coverage: Row[] = [],
    annualValues: Row[] = [],
    latest: Row[] = [];
  for (const origin of [...new Set(predictions.map((r) => r.origin))].sort(
    (a, b) => a - b,
  )) {
    const targetYear = origin + 2;
    const data =
      targetYear <= 2026
        ? await read(resolve(values.history, `${targetYear}.json`))
        : null;
    const picks = data
      ? source.draftPickRows.filter(
          (r: Row) =>
            r.seasonId === data.season.id && r.playerId && r.gshlTeamId,
        )
      : [];
    const teams = [...new Set<string>(picks.map((r: Row) => r.gshlTeamId))];
    if (!teams.length && origin !== latestOrigin) continue;
    const leagueSize = teams.length || 14;
    const prior = history.contexts.filter(
      (c: MatchupContext) =>
        c.year <= origin + 1 && c.year >= Math.max(2017, origin - 3),
    ) as MatchupContext[];
    const contexts = Array.from(
      { length: Math.min(192, prior.length) },
      (_, i) =>
        prior[Math.floor((i * prior.length) / Math.min(192, prior.length))]!,
    );
    if (!contexts.length) throw new Error("Missing prior contexts");
    const utilization = {} as Record<Position, number>,
      owned = {} as Record<Position, number>,
      base = { F: 7, D: 3, G: 1 };
    for (const p of positions) {
      const rows = history.usage.filter(
        (r: Row) =>
          r.year <= origin + 1 &&
          r.year >= Math.max(2017, origin - 3) &&
          r.pos === p,
      );
      utilization[p] =
        rows.reduce((s: number, r: Row) => s + r.gs, 0) /
        rows.reduce((s: number, r: Row) => s + r.gp, 0);
      owned[p] =
        rows.reduce((s: number, r: Row) => s + r.owned, 0) / rows.length;
    }
    const extra = positions.reduce(
        (s, p) => s + Math.max(0, owned[p] - base[p]),
        0,
      ),
      empirical = Object.fromEntries(
        positions.map((p) => [
          p,
          base[p] + (4 * Math.max(0, owned[p] - base[p])) / extra,
        ]),
      ) as Record<Position, number>;
    const methods = new Map<string, Map<string, number>>();
    const rawRows = source.playerNhlRows.filter(
      (r: Row) => years.get(r.seasonId) === origin + 1,
    );
    methods.set(
      "raw-rating",
      new Map(
        rawRows.map((r: Row) => [
          r.playerId,
          Number(r.overallRating ?? r.seasonRating ?? 0),
        ]),
      ),
    );
    methods.set("home-only", new Map());
    const horizons = [1, 2, 3];
    for (const horizon of horizons) {
      const cohort = predictions.filter(
        (r) => r.origin === origin && r.horizon === horizon,
      );
      if (!cohort.length) continue;
      const pool: PlayerProjection[] = cohort.map((r) => ({
        ...r.prediction,
        id: String(r.playerId),
        position: r.position,
      }));
      const actualRows = source.playerNhlRows.filter(
        (r: Row) => years.get(r.seasonId) === origin + horizon + 1,
      );
      const actualById = new Map<string, Row>(
        actualRows.map((r: Row) => [r.playerId, r]),
      );
      const realized = new Map<string, number>();
      for (const variant of variants) {
        const slots = variant.slots ?? empirical,
          depth = Object.fromEntries(
            positions.map((p) => [p, leagueSize * slots[p]]),
          ) as Record<Position, number>;
        const scored = unifiedSalaryValues(
          pool,
          contexts,
          utilization,
          depth,
          variant.objective,
        );
        const mapped = new Map<string, number>();
        for (const r of scored) {
          const canonical = ids.get(Number(r.id));
          if (canonical) mapped.set(canonical, r.value);
          let actualValue: number | null = null;
          if (
            actualRows.length >= 900 &&
            canonical &&
            ![2019, 2020].includes(origin + horizon)
          ) {
            const key = variant.objective + ":" + r.id;
            if (!realized.has(key)) {
              const a = actualById.get(canonical),
                p = { id: r.id, position: r.position } as PlayerProjection;
              for (const k of [
                "GP",
                "G",
                "A",
                "PPP",
                "SOG",
                "HIT",
                "BLK",
                "W",
                "GA",
                "SA",
                "SV",
                "MIN",
              ] as const)
                p[k] = Number(a?.[k === "MIN" ? "TOI" : k] || 0);
              const score =
                variant.objective === "categories"
                  ? expectedCategoryWins
                  : expectedMatchupWin;
              realized.set(key, score(p, contexts, utilization[r.position]));
            }
            actualValue = realized.get(key)! - r.replacement;
          }
          annualValues.push({
            origin,
            horizon,
            method: variant.name,
            ...r,
            actualValue,
            rawRating: canonical
              ? (methods.get("raw-rating")!.get(canonical) ?? 0)
              : 0,
            originGames: cohort.find((p) => String(p.playerId) === r.id)!
              .originGames,
          });
        }
        if (horizon === 1) methods.set(variant.name, mapped);
        if (origin === latestOrigin)
          latest.push(
            ...scored.map((r) => ({
              origin,
              horizon,
              method: variant.name,
              ...r,
              name: cohort.find((p) => String(p.playerId) === r.id)!.name,
            })),
          );
      }
    }
    if (data && methods.has("category-empirical")) {
      const weeks = new Map<string, Row>(data.weeks.map((r: Row) => [r.id, r]));
      for (const m of data.matchups) {
        if (
          !m.isComplete ||
          weeks.get(m.weekId)?.weekType !== "RS" ||
          (!m.homeWin && !m.awayWin && !m.tie)
        )
          continue;
        for (const mode of ["opening", "prior-week"]) {
          const scoreTeam = (team: string) => {
            const opening = [
              ...new Set<string>(
                picks
                  .filter((r: Row) => r.gshlTeamId === team)
                  .map((r: Row) => r.playerId),
              ),
            ];
            const roster =
              mode === "opening"
                ? opening
                : priorWeekRoster(
                    weeks.get(m.weekId)! as { id: string },
                    data.weeks,
                    data.playerWeeks,
                    team,
                    opening,
                  );
            return Object.fromEntries(
              [...methods].map(([name, map]) => [
                name,
                roster.reduce((s, id) => s + (map.get(id) ?? 0), 0),
              ]),
            );
          };
          const a = scoreTeam(m.homeTeamId),
            b = scoreTeam(m.awayTeamId);
          games.push({
            year: targetYear,
            mode,
            matchupId: m.id,
            actual: m.homeWin ? 1 : m.awayWin ? 0 : 0.5,
            delta: Object.fromEntries(
              [...methods.keys()].map((name) => [name, a[name]! - b[name]!]),
            ),
          });
        }
      }
    }
    coverage.push({
      origin,
      targetYear,
      players: predictions.filter((r) => r.origin === origin && r.horizon === 1)
        .length,
      contexts: contexts.length,
      latestContextYear: Math.max(...contexts.map((c) => c.year)),
      utilization,
      slots: empirical,
    });
    console.log(JSON.stringify(coverage.at(-1)));
  }
  const evaluated: Row[] = [],
    names = ["home-only", "raw-rating", ...variants.map((v) => v.name)];
  for (const mode of ["opening", "prior-week"])
    for (const year of [2021, 2022, 2023, 2024, 2025, 2026])
      for (const method of names) {
        const train = games.filter((r) => r.mode === mode && r.year < year);
        if (train.length < 100 || new Set(train.map((r) => r.year)).size < 2)
          continue;
        const model = fitMatchupProbability(
          train.map((r) => ({
            year: r.year,
            x: r.delta[method],
            actual: r.actual,
          })),
          year,
        );
        for (const row of games.filter(
          (r) => r.mode === mode && r.year === year,
        ))
          evaluated.push({
            ...row,
            method,
            prediction: matchupProbability(row.delta[method], model),
            model,
          });
      }
  function summarize(rows: Row[]) {
    return ["opening", "prior-week"].flatMap((mode) =>
      names.map((method) => {
        const r = rows.filter((r) => r.mode === mode && r.method === method);
        return {
          mode,
          method,
          n: r.length,
          brier: r.length
            ? r.reduce((s, p) => s + (p.prediction - p.actual) ** 2, 0) /
              r.length
            : null,
          accuracy: r.length
            ? r.reduce(
                (s, p) =>
                  s +
                  (p.actual === 0.5
                    ? 0.5
                    : Number(p.prediction >= 0.5 === (p.actual === 1))),
                0,
              ) / r.length
            : null,
        };
      }),
    );
  }
  const training = summarize(evaluated.filter((r) => r.year <= 2023)),
    later = summarize(evaluated.filter((r) => r.year >= 2024));
  const candidateScores = variants
    .map((v) => ({
      method: v.name,
      error:
        training
          .filter((r) => r.method === v.name)
          .reduce((s, r) => s + (r.brier ?? 1), 0) / 2,
    }))
    .sort((a, b) => a.error - b.error);
  const selected = candidateScores[0]!.method;
  const ranked: Row[] = [];
  for (const term of [2, 3]) {
    const cohort = latest.filter(
      (r) => r.method === selected && r.horizon === 1,
    );
    const combined = cohort.map((r) => {
      const horizons = latest.filter(
        (p) => p.id === r.id && p.method === selected && p.horizon <= term,
      );
      if (horizons.length !== term) throw new Error("Incomplete future term");
      return {
        id: r.id,
        name: r.name,
        position: r.position,
        term,
        value: horizons.reduce((s, p) => s + p.value, 0) / term,
        horizons: horizons.map((p) => ({
          horizon: p.horizon,
          value: p.value,
          replacement: p.replacement,
        })),
      };
    });
    ranked.push(...rankUnifiedValues(combined));
  }
  const contractRows: Row[] = [],
    groups = new Map<string, Row[]>();
  for (const r of annualValues) {
    const key = `${r.origin}:${r.id}:${r.method}`,
      group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }
  for (const group of groups.values())
    for (const term of [2, 3]) {
      const r = group.find((p) => p.horizon === 1);
      if (!r) continue;
      const window = group.filter((p) => p.horizon <= term);
      if (window.length !== term || window.some((p) => p.actualValue === null))
        continue;
      contractRows.push({
        origin: r.origin,
        id: r.id,
        position: r.position,
        method: r.method,
        term,
        originGames: r.originGames,
        rawRating: r.rawRating,
        value: window.reduce((s, p) => s + p.value, 0) / term,
        actual: window.reduce((s, p) => s + p.actualValue, 0) / term,
      });
    }
  const contracts = [2, 3].flatMap((term) =>
    variants.flatMap((v) =>
      ["all", "established"].map((cohort) => {
        const rows = contractRows.filter(
          (r) =>
            r.term === term &&
            r.method === v.name &&
            (cohort === "all" ||
              r.originGames >= (r.position === "G" ? 15 : 40)),
        );
        const summary = (r: Row[]) => ({
          n: r.length,
          rankCorrelation: spearman(
            r.map((p) => p.value),
            r.map((p) => p.actual),
          ),
          rawRatingCorrelation: spearman(
            r.map((p) => p.rawRating),
            r.map((p) => p.actual),
          ),
        });
        return {
          term,
          method: v.name,
          cohort,
          ...summary(rows),
          origins: [...new Set(rows.map((r) => r.origin))].map((origin) => ({
            origin,
            ...summary(rows.filter((r) => r.origin === origin)),
          })),
          positions: positions.map((position) => ({
            position,
            ...summary(rows.filter((r) => r.position === position)),
          })),
        };
      }),
    ),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    version: "unified-salary-research-v1",
    latestOrigin,
    selected,
    selection:
      "Lowest combined opening/prior-week Brier among three predefined value candidates in evaluation years through 2023; later years not used to choose candidate.",
    coverage,
    training,
    later,
    years: [2024, 2025, 2026].map((year) => ({
      year,
      metrics: summarize(evaluated.filter((r) => r.year === year)),
    })),
    predictions: evaluated,
    players: ranked,
    annualValues,
    contracts,
    contractRows,
    limitations: [
      "Research selection, not proof of superiority over existing salaries. These historical years were examined previously.",
      "Forecasts reconstructed from season-end NHL categories and NHL impact; no future roster/ice time used. Source revisions are not signing-day archives.",
      "Contract rating is the equal-weight mean of future yearly replacement value. Complete-term validation applies actual NHL production to origin-frozen neutral contexts and replacement benchmarks, not realized owner lineup choices. Retired/departed linked players get zero production; unlinked identities and pandemic target years 2019/2020 are excluded from contract targets. Complete targets include only seasons with at least 900 retained NHL rows.",
      "Within-game variance and optimized future lineups are not simulated. Missing NHL prospects receive neutral excess value in evaluation.",
      "Percentile is pooled across all positions, not within-position. Replacement-relative values, not percentages, determine order. No production writes.",
    ],
  };
  await writeFile(
    resolve(values.output, "validation.json"),
    JSON.stringify(report),
    { flag: "wx" },
  );
  const cell = (x: unknown) =>
    '"' + String(x ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    resolve(values.output, "rankings.csv"),
    "\ufeff" +
      [
        ["term", "rank", "name", "position", "rating", "value"],
        ...ranked.map((r) => [
          r.term,
          r.rank,
          r.name,
          r.position,
          r.rating,
          r.value,
        ]),
      ]
        .map((r) => r.map(cell).join(","))
        .join("\r\n"),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        selected,
        training,
        later,
        top: ranked.filter((r) => r.term === 2).slice(0, 25),
      },
      null,
      2,
    ),
  );
}

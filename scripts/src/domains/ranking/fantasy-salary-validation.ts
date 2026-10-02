import { rankRowsWithRankingEngine } from "./ranking-engine";
import {
  buildSeasonLeagueAnchors,
  computeOverallRatingForHistory,
  getAgeMarketAdjustment,
} from "./player-rating-backfill";
import type {
  CategoryPrediction,
  CategorySeason,
} from "../../runtime/fantasy-category-forecast";
import { categoryPrediction } from "../../runtime/fantasy-category-forecast";
import type { runCategoryBacktest } from "./fantasy-category-backtest";
import { correlation, spearman } from "./nhl-rating-diagnostics";

type Backtest = ReturnType<typeof runCategoryBacktest>;
type EngineRow = Record<string, string | number | null>;
function engineRow(
  r: CategorySeason,
  p: CategoryPrediction,
  raw: boolean,
  year: number,
): EngineRow {
  const startShare = r.rawTotals?.GP
    ? (r.rawStarts ?? r.rawTotals.GP) / r.rawTotals.GP
    : 1;
  return {
    id: String(r.playerId),
    playerId: String(r.playerId),
    seasonId: String(year),
    seasonType: "RS",
    posGroup: r.position,
    nhlPos: r.position,
    GP: p.GP,
    GS: raw ? (r.rawStarts ?? p.GP) : p.GP * startShare,
    G: p.G,
    A: p.A,
    P: p.P,
    PPP: p.PPP,
    SOG: p.SOG,
    HIT: p.HIT,
    BLK: p.BLK,
    W: p.W,
    GAA: p.GAA,
    SVP: p.SVP,
    GA: p.GA,
    SA: p.SA,
    SV: p.SV,
    TOI: p.MIN,
  };
}
async function rate(rows: EngineRow[]) {
  return (await rankRowsWithRankingEngine(rows, {
    dataModelName: "PlayerNHL",
    dataContext: { playerNhlRows: rows },
    mutate: false,
  })) as EngineRow[];
}
type Scored = {
  origin: number;
  horizon: number;
  playerId: number;
  position: string;
  established: boolean;
  method: string;
  prediction: number;
  actual: number;
};
export async function validateSalaryForecasts(
  input: CategorySeason[],
  variants: Record<string, Backtest>,
  log: (s: string) => void,
) {
  const byKey = new Map(input.map((r) => [`${r.year}:${r.playerId}`, r]));
  const seasonal = new Map<string, EngineRow>(),
    talent = new Map<string, number>(),
    market = new Map<string, number>();
  for (const year of [...new Set(input.map((r) => r.year))].sort()) {
    const rows = input.filter((r) => r.year === year);
    const rated = await rate(
      rows.map((r) =>
        engineRow(r, categoryPrediction(r.rawTotals ?? r.totals), true, year),
      ),
    );
    const anchors = buildSeasonLeagueAnchors(rated);
    for (const r of rated) seasonal.set(`${year}:${r.playerId}`, r);
    for (const r of rows) {
      const history = input
        .filter((p) => p.playerId === r.playerId && p.year <= year)
        .sort((a, b) => b.year - a.year)
        .slice(0, 4)
        .map((p) => seasonal.get(`${p.year}:${p.playerId}`)!);
      const overall = computeOverallRatingForHistory(
        history,
        anchors[r.position] ?? 62.5,
      );
      if (overall === null) throw new Error("Missing current talent baseline");
      const age =
        (Date.UTC(year, 9, 1) - Date.parse(r.birthDate + "T00:00:00Z")) /
        (365.2425 * 86400000);
      talent.set(`${year}:${r.playerId}`, overall);
      market.set(
        `${year}:${r.playerId}`,
        overall +
          0.08 * Number(seasonal.get(`${year}:${r.playerId}`)!.seasonRating) +
          getAgeMarketAdjustment(age),
      );
    }
    log(`Replayed current talent formula for ${year}: ${rated.length} players`);
  }
  const scores: Scored[] = [];
  for (const [method, result] of Object.entries(variants)) {
    const predictions = result.records.filter(
      (r) => r.method === "category-model",
    );
    for (const origin of [...new Set(predictions.map((r) => r.origin))].sort())
      for (const horizon of [1, 2, 3]) {
        const pool = predictions.filter(
          (r) => r.origin === origin && r.horizon === horizon,
        );
        if (!pool.length) continue;
        const rated = await rate(
          pool.map((r) =>
            engineRow(
              byKey.get(`${origin}:${r.playerId}`)!,
              r.prediction,
              false,
              origin + horizon,
            ),
          ),
        );
        const values = new Map(
          rated.map((r) => [Number(r.playerId), Number(r.seasonRating ?? 0)]),
        );
        for (const r of pool) {
          const future = seasonal.get(`${origin + horizon}:${r.playerId}`),
            actual = future ? Number(future.seasonRating ?? 0) : 0;
          const common = {
            origin,
            horizon,
            playerId: r.playerId,
            position: r.position,
            established: r.established,
            actual,
          };
          scores.push({
            ...common,
            method,
            prediction: r.prediction.GP > 0 ? values.get(r.playerId)! : 0,
          });
          if (method === Object.keys(variants)[0]) {
            scores.push({
              ...common,
              method: "current-talent",
              prediction: talent.get(`${origin}:${r.playerId}`)!,
            });
            scores.push({
              ...common,
              method: "current-market-score",
              prediction: market.get(`${origin}:${r.playerId}`)!,
            });
          }
        }
        log(`Scored ${method}: origin ${origin}, horizon ${horizon}`);
      }
  }
  const grouped = new Map<string, Scored[]>();
  for (const r of scores) {
    const key = `${r.origin}:${r.playerId}:${r.method}`,
      group = grouped.get(key) ?? [];
    group.push(r);
    grouped.set(key, group);
  }
  const terms: Scored[] = [];
  for (const group of grouped.values())
    for (const term of [2, 3]) {
      const rows = group.filter((r) => r.horizon <= term);
      if (rows.length !== term) continue;
      terms.push({
        ...rows[0]!,
        horizon: term,
        prediction: rows.reduce((s, r) => s + r.prediction, 0) / term,
        actual: rows.reduce((s, r) => s + r.actual, 0) / term,
      });
    }
  const summarize = (rows: Scored[]) => {
    const result = [];
    for (const position of ["F", "D", "G"])
      for (const horizon of [1, 2, 3])
        for (const cohort of ["all", "established"])
          for (const method of [...new Set(rows.map((r) => r.method))]) {
            const pool = rows.filter(
              (r) =>
                r.position === position &&
                r.horizon === horizon &&
                r.method === method &&
                (cohort === "all" || r.established),
            );
            if (!pool.length) continue;
            const y = pool.map((r) => r.actual),
              p = pool.map((r) => r.prediction);
            if ([...y, ...p].some((v) => !Number.isFinite(v)))
              throw new Error("Nonfinite salary evaluation");
            result.push({
              position,
              horizon,
              cohort,
              method,
              n: pool.length,
              rmse: Math.sqrt(
                y.reduce((s, v, i) => s + (p[i]! - v) ** 2, 0) / pool.length,
              ),
              mae:
                y.reduce((s, v, i) => s + Math.abs(p[i]! - v), 0) / pool.length,
              pearson: correlation(y, p),
              spearman: spearman(y, p),
            });
          }
    return result;
  };
  return {
    annual: summarize(scores),
    terms: summarize(terms),
    folds: [...new Set(scores.map((r) => r.origin))]
      .sort()
      .map((origin) => ({
        origin,
        annual: summarize(scores.filter((r) => r.origin === origin)),
        terms: summarize(terms.filter((r) => r.origin === origin)),
      })),
    scores,
    termsScores: terms,
  };
}

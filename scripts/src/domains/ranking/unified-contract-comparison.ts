import { spearman } from "./nhl-rating-diagnostics";
type Contract = {
  origin: number;
  term: number;
  id: string;
  method: string;
  position: string;
  originGames: number;
  value: number;
  actual: number;
};
type Prior = {
  origin: number;
  horizon: number;
  playerId: number;
  method: string;
  prediction: number;
};
/** Paired comparison against the preceding calibrated forecaster on identical targets. */
export function compareUnifiedForecastContracts(
  contracts: readonly Contract[],
  previous: readonly Prior[],
  selected: string,
) {
  const map = new Map(
    previous.map((r) => [
      `${r.origin}:${r.horizon}:${r.playerId}:${r.method}`,
      r.prediction,
    ]),
  );
  const joined = contracts
    .filter((p) => p.method === selected)
    .map((p) => ({
      ...p,
      previous: map.get(
        `${p.origin}:${p.term}:${p.id}:${p.position === "F" && p.originGames < 40 ? "age-usage" : "position-best"}+calibrated`,
      ),
    }))
    .filter((p): p is Contract & { previous: number } =>
      Number.isFinite(p.previous),
    );
  return [2, 3].flatMap((term) =>
    ["all", "established"].flatMap((cohort) =>
      ["ALL", "F", "D", "G"].map((position) => {
        const rows = joined.filter(
          (r) =>
            r.term === term &&
            (position === "ALL" || r.position === position) &&
            (cohort === "all" ||
              r.originGames >= (r.position === "G" ? 15 : 40)),
        );
        return {
          term,
          cohort,
          position,
          n: rows.length,
          unified: spearman(
            rows.map((r) => r.value),
            rows.map((r) => r.actual),
          ),
          previous: spearman(
            rows.map((r) => r.previous),
            rows.map((r) => r.actual),
          ),
        };
      }),
    ),
  );
}

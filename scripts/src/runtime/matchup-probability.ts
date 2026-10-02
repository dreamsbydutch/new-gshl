export type MatchupExample = { year: number; x: number; actual: number };
const logistic = (x: number) =>
  1 / (1 + Math.exp(-Math.max(-25, Math.min(25, x))));
/** Fixed ridge penalty and nonnegative talent slope; only earlier completed years train. */
export function fitMatchupProbability(
  rows: readonly MatchupExample[],
  cutoff: number,
) {
  const train = rows.filter((r) => r.year < cutoff);
  if (train.length < 100 || new Set(train.map((r) => r.year)).size < 2)
    throw new Error("Insufficient chronological calibration");
  if (
    train.some(
      (r) =>
        !Number.isFinite(r.x) ||
        !Number.isFinite(r.actual) ||
        r.actual < 0 ||
        r.actual > 1,
    )
  )
    throw new Error("Invalid matchup observation");
  const scale =
    Math.sqrt(train.reduce((s, r) => s + r.x * r.x, 0) / train.length) || 1;
  let a = 0,
    b = 0;
  for (let step = 0; step < 50; step++) {
    let ga = 0,
      gb = -5 * b,
      aa = 1e-4,
      ab = 0,
      bb = 5;
    for (const r of train) {
      const x = r.x / scale,
        p = logistic(a + b * x),
        w = p * (1 - p);
      ga += r.actual - p;
      gb += x * (r.actual - p);
      aa += w;
      ab += w * x;
      bb += w * x * x;
    }
    const determinant = aa * bb - ab * ab,
      da = (ga * bb - gb * ab) / determinant,
      db = (gb * aa - ga * ab) / determinant;
    const next = Math.max(0, b + db),
      interceptStep = next === 0 ? ga / aa : da;
    a += interceptStep;
    const change = Math.abs(interceptStep) + Math.abs(next - b);
    b = next;
    if (change < 1e-8) break;
  }
  return {
    intercept: a,
    slope: b,
    scale,
    n: train.length,
    latestYear: Math.max(...train.map((r) => r.year)),
  };
}
export function matchupProbability(
  x: number,
  model: ReturnType<typeof fitMatchupProbability>,
) {
  return logistic(model.intercept + (model.slope * x) / model.scale);
}

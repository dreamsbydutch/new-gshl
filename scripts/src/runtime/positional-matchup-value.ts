/** Experimental valuation unit: modeled matchup wins above a positional replacement. */
export type Position = "F" | "D" | "G";
// G,A,PPP,SOG,HIT,BLK,W,GA,SA,SV,goalie minutes,active goalie appearances.
export type Line = number[];
export type MatchupContext = {
  year: number;
  days: number;
  own: Line;
  opponent: Line;
  donors: Record<Position, Line>;
};
export type PlayerProjection = {
  id: string;
  position: Position;
  GP: number;
  G: number;
  A: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  SA: number;
  SV: number;
  MIN: number;
};
export const emptyLine = (): Line => Array(12).fill(0);
export function addLine(a: Line, b: Line, scale = 1): Line {
  return a.map((x, i) => Math.max(0, x + scale * b[i]!));
}
function compare(a: number, b: number) {
  return a === b || Math.abs(a - b) < 1e-8 ? 0 : a > b ? 1 : -1;
}
/** Tied overall categories are worth half a win for neutral home assignment. */
export function categoryMargin(a: Line, b: Line) {
  let margin = 0;
  for (let i = 0; i < 6; i++) margin += compare(a[i]!, b[i]!);
  margin += compare(a[0]! + a[1]!, b[0]! + b[1]!);
  const aq = a[11]! >= 2,
    bq = b[11]! >= 2;
  if (aq !== bq) return margin + (aq ? 3 : -3);
  if (!aq) return margin;
  margin += compare(a[6]!, b[6]!);
  margin -= compare(
    a[10]! > 0 ? (60 * a[7]!) / a[10]! : Infinity,
    b[10]! > 0 ? (60 * b[7]!) / b[10]! : Infinity,
  );
  margin += compare(
    a[8]! > 0 ? a[9]! / a[8]! : 0,
    b[8]! > 0 ? b[9]! / b[8]! : 0,
  );
  return margin;
}
export function matchupWin(a: Line, b: Line) {
  const m = categoryMargin(a, b);
  return m > 0 ? 1 : m < 0 ? 0 : 0.5;
}
function appearanceDistribution(mean: number, max: number) {
  const values = [];
  let p = Math.exp(-mean),
    mass = 0;
  for (let n = 0; n < max; n++) {
    values.push(p);
    mass += p;
    p *= mean / (n + 1);
  }
  values.push(Math.max(0, 1 - mass));
  return values;
}
/** Integrates uncertain appearances; does not treat fractional expected GP as qualifying. */
export function expectedMatchupWin(
  player: PlayerProjection,
  contexts: readonly MatchupContext[],
  utilization: number,
  weeks = 26,
) {
  if (!contexts.length) throw new Error("Historical matchup contexts required");
  if (
    !Number.isFinite(player.GP) ||
    player.GP < 0 ||
    !Number.isFinite(utilization) ||
    utilization < 0 ||
    utilization > 1 ||
    !Number.isFinite(weeks) ||
    weeks <= 0
  )
    throw new Error("Invalid projection exposure");
  const perGame = emptyLine(),
    den = Math.max(1, player.GP);
  if (player.position === "G") {
    for (const [i, k] of [
      [6, "W"],
      [7, "GA"],
      [8, "SA"],
      [9, "SV"],
      [10, "MIN"],
    ] as const)
      perGame[i] = player[k] / den;
    perGame[11] = 1;
  } else
    for (const [i, k] of [
      [0, "G"],
      [1, "A"],
      [2, "PPP"],
      [3, "SOG"],
      [4, "HIT"],
      [5, "BLK"],
    ] as const)
      perGame[i] = player[k] / den;
  if (perGame.some((v) => !Number.isFinite(v) || v < 0))
    throw new Error("Invalid projected rates");
  let score = 0;
  for (const c of contexts) {
    if (!Number.isFinite(c.days) || c.days < 1 || c.days > 31)
      throw new Error("Invalid matchup duration");
    const base = addLine(c.own, c.donors[player.position], -1);
    const count = appearanceDistribution(
      ((player.GP / weeks) * utilization * c.days) / 7,
      Math.ceil(c.days),
    );
    let win = 0;
    for (let n = 0; n < count.length; n++) {
      if (count[n]! < 1e-8) continue;
      win += count[n]! * matchupWin(addLine(base, perGame, n), c.opponent);
    }
    score += win;
  }
  return score / contexts.length;
}
export function positionalMatchupValue(
  player: PlayerProjection,
  replacement: PlayerProjection,
  contexts: readonly MatchupContext[],
  utilization: number,
  weeks = 26,
) {
  if (player.position !== replacement.position)
    throw new Error("Replacement position mismatch");
  return (
    expectedMatchupWin(player, contexts, utilization, weeks) -
    expectedMatchupWin(replacement, contexts, utilization, weeks)
  );
}

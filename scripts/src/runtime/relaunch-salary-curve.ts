/** Owner proposal: shape-preserving cubic through rank benchmarks, $50k rounding. */
const ranks = [3, 20, 160, 325, 400];
const millions = [10, 9.25, 5.75, 2.5, 1];
const widths = ranks.slice(1).map((v, i) => v - ranks[i]!);
const slopes = widths.map((v, i) => (millions[i + 1]! - millions[i]!) / v);
function endpoint(h0: number, h1: number, d0: number, d1: number) {
  const m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
  return Math.sign(m) !== Math.sign(d0)
    ? 0
    : Math.sign(d0) !== Math.sign(d1) && Math.abs(m) > 3 * Math.abs(d0)
      ? 3 * d0
      : m;
}
const derivatives = [endpoint(widths[0]!, widths[1]!, slopes[0]!, slopes[1]!)];
for (let i = 1; i < ranks.length - 1; i++) {
  const w1 = 2 * widths[i]! + widths[i - 1]!,
    w2 = widths[i]! + 2 * widths[i - 1]!;
  derivatives.push(
    slopes[i - 1]! * slopes[i]! <= 0
      ? 0
      : (w1 + w2) / (w1 / slopes[i - 1]! + w2 / slopes[i]!),
  );
}
derivatives.push(endpoint(widths[3]!, widths[2]!, slopes[3]!, slopes[2]!));
export function relaunchAnnualSalary(rank: number) {
  if (!Number.isFinite(rank) || rank < 1)
    throw new Error("Invalid salary rank");
  if (rank <= 3) return 10e6;
  if (rank >= 400) return 1e6;
  const i = ranks.findIndex((v) => v > rank) - 1;
  const t = (rank - ranks[i]!) / widths[i]!;
  const value =
    (2 * t ** 3 - 3 * t ** 2 + 1) * millions[i]! +
    (t ** 3 - 2 * t ** 2 + t) * widths[i]! * derivatives[i]! +
    (-2 * t ** 3 + 3 * t ** 2) * millions[i + 1]! +
    (t ** 3 - t ** 2) * widths[i]! * derivatives[i + 1]!;
  return Math.round((value * 1e6) / 50000) * 50000;
}

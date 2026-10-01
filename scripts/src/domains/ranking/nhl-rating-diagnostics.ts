/** Diagnostic statistics only; these do not calculate or modify production ratings. */
export function ranks(values: readonly number[]): number[] {
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);
  const result = new Array<number>(values.length);
  for (let i = 0; i < ordered.length; ) {
    let end = i + 1;
    while (end < ordered.length && ordered[end]!.value === ordered[i]!.value)
      end++;
    for (let j = i; j < end; j++) result[ordered[j]!.index] = (i + 1 + end) / 2;
    i = end;
  }
  return result;
}
export function correlation(
  a: readonly number[],
  b: readonly number[],
): number | null {
  if (a.length !== b.length) throw new Error("Paired observations required");
  if (a.length < 2 || [...a, ...b].some((x) => !Number.isFinite(x)))
    return null;
  const mean = (values: readonly number[]) =>
    values.reduce((s, x) => s + x, 0) / values.length;
  const am = mean(a),
    bm = mean(b);
  let covariance = 0,
    av = 0,
    bv = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - am,
      y = b[i]! - bm;
    covariance += x * y;
    av += x * x;
    bv += y * y;
  }
  return av > 0 && bv > 0 ? covariance / Math.sqrt(av * bv) : null;
}
export function spearman(
  a: readonly number[],
  b: readonly number[],
): number | null {
  if (a.length !== b.length) throw new Error("Paired observations required");
  if ([...a, ...b].some((x) => !Number.isFinite(x))) return null;
  return correlation(ranks(a), ranks(b));
}
export function quantile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const offset = (sorted.length - 1) * fraction,
    lower = Math.floor(offset);
  return (
    sorted[lower]! +
    (sorted[Math.ceil(offset)]! - sorted[lower]!) * (offset - lower)
  );
}
export function compareRanks(
  original: readonly number[],
  alternate: readonly number[],
) {
  const a = ranks(original),
    b = ranks(alternate);
  const shifts = a.map((rank, i) => Math.abs(rank - b[i]!));
  return {
    spearman: spearman(original, alternate),
    medianShift: quantile(shifts, 0.5),
    p90Shift: quantile(shifts, 0.9),
    maximumShift: Math.max(0, ...shifts),
    top20Retained: a.filter((rank, i) => rank <= 20 && b[i]! <= 20).length,
  };
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(value.replace(/\r$/, ""));
      value = "";
      if (c === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else value += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  const header = rows.shift();
  if (!header) throw new Error("Missing CSV header");
  return rows.map((cells) => {
    if (cells.length !== header.length) throw new Error("CSV column mismatch");
    return Object.fromEntries(header.map((key, i) => [key, cells[i]!]));
  });
}

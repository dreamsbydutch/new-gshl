import type {
  NhlTalentAdaptation,
  NhlTalentAdaptationMetrics,
  NhlTalentRateObservation,
  NhlTalentRateValidationRow,
} from "../../types/nhl-conditional-talent";

export const NHL_TALENT_ADAPTATION_POLICY = {
  reliabilityMinutes: 600,
  weights: [0, 0.25, 0.5, 1],
  warmupOrigins: 3,
  minimumLateGrowthRows: 30,
} as const;

function supportsAdaptation(v: NhlTalentAdaptation["validation"]) {
  return (
    v.rows >= 100 &&
    v.baseMse !== null &&
    v.adaptiveMse !== null &&
    v.adaptiveMse < v.baseMse &&
    v.lateGrowth.rows >= NHL_TALENT_ADAPTATION_POLICY.minimumLateGrowthRows &&
    v.lateGrowth.baseMse !== null &&
    v.lateGrowth.adaptiveMse !== null &&
    v.lateGrowth.adaptiveMse < v.lateGrowth.baseMse &&
    v.changedOrigins >= 3 &&
    v.winningOrigins * 3 >= v.changedOrigins * 2
  );
}

/** Franchise moves do not by themselves establish a new player deployment. */
export function nhlTalentTeamSet(teams: readonly string[] | undefined) {
  if (teams === undefined) return [];
  const input: unknown = teams;
  if (
    !Array.isArray(input) ||
    teams.some((t) => typeof t !== "string" || !/^[A-Z]{2,3}$/.test(t))
  )
    throw Error("Invalid NHL talent team context");
  const alias: Record<string, string> = { PHX: "UTA", ARI: "UTA", ATL: "WPG" };
  return [...new Set(teams.map((t) => alias[t] ?? t))].sort();
}

/** Repeated measured changes update level, not an extrapolated perpetual trend.
 * No age ceiling, availability factor, trade bonus or isolated-season reset.
 */
export function nhlTalentChangeEvidence(
  observations: readonly NhlTalentRateObservation[],
  origin: number,
  base: number,
) {
  if (!Number.isSafeInteger(origin) || !Number.isFinite(base))
    throw Error("Invalid NHL change origin");
  const h = observations.filter((o) => o.year <= origin);
  if (
    h.some(
      (o, i) =>
        !Number.isFinite(o.minutes) ||
        o.minutes <= 0 ||
        !Number.isFinite(o.gar) ||
        (i > 0 && o.year <= h[i - 1]!.year),
    )
  )
    throw Error("Invalid NHL change history");
  const a = h.at(-3),
    b = h.at(-2),
    c = h.at(-1);
  const rate = (o: NhlTalentRateObservation) => (o.gar * 60) / o.minutes;
  const lastPair = b && c?.year === b.year + 1;
  const currentTeams = nhlTalentTeamSet(c?.teams),
    priorTeams = nhlTalentTeamSet(b?.teams);
  const teamSetChanged =
    lastPair && currentTeams.length && priorTeams.length
      ? currentTeams.join(",") !== priorTeams.join(",")
      : null;
  const minutesPerAppearanceChange =
    lastPair && b.games && c.games
      ? c.minutes / c.games - b.minutes / b.games
      : null;
  const consecutive = a && b && c && lastPair && b.year === a.year + 1;
  const firstChange = consecutive ? rate(b) - rate(a) : 0;
  const lastChange = lastPair ? rate(c) - rate(b) : 0;
  const direction =
    consecutive && firstChange * lastChange > 0
      ? lastChange > 0
        ? ("growth" as const)
        : ("decline" as const)
      : null;
  let delta = 0;
  if (direction && a && b && c) {
    const reliability = Math.min(
      ...[a, b, c].map(
        (o) =>
          o.minutes /
          (o.minutes + NHL_TALENT_ADAPTATION_POLICY.reliabilityMinutes),
      ),
    );
    const coherence =
      (2 * Math.min(Math.abs(firstChange), Math.abs(lastChange))) /
      (Math.abs(firstChange) + Math.abs(lastChange));
    const recentLevel = ((b.gar + c.gar) * 60) / (b.minutes + c.minutes);
    if ((recentLevel - base) * lastChange > 0)
      delta = (recentLevel - base) * reliability * coherence;
  }
  return {
    direction,
    delta,
    teamSetChanged,
    minutesPerAppearanceChange,
    lateGrowth: direction === "growth" && (c?.age ?? 0) >= 28,
    unconfirmedJump: lastChange > 0.15 && firstChange <= 0,
    stale: c ? c.year < origin : false,
  };
}

/** Each candidate weight is chosen before that origin's outcomes are scored.
 * Promotion guards are retrospective checks; they are not an untouched holdout.
 */
export function fitNhlTalentAdaptation(
  rows: readonly NhlTalentRateValidationRow[],
  histories: ReadonlyMap<number, readonly NhlTalentRateObservation[]>,
  cutoff: number,
) {
  if (!Number.isSafeInteger(cutoff) || cutoff < 1900)
    throw Error("Invalid NHL adaptation cutoff");
  const keys = new Set<string>();
  const examples = rows.map((r) => {
    const key = `${r.nhlPlayerId}:${r.originYear}`;
    if (
      !Number.isSafeInteger(r.nhlPlayerId) ||
      r.nhlPlayerId <= 0 ||
      !Number.isSafeInteger(r.originYear) ||
      r.originYear < 1900 ||
      r.targetYear !== r.originYear + 1 ||
      r.targetYear > cutoff ||
      !Number.isFinite(r.predicted) ||
      !Number.isFinite(r.actual) ||
      keys.has(key)
    )
      throw Error("Invalid or future NHL adaptation row");
    keys.add(key);
    return {
      row: r,
      key,
      evidence: nhlTalentChangeEvidence(
        histories.get(r.nhlPlayerId) ?? [],
        r.originYear,
        r.predicted,
      ),
    };
  });
  const weights = NHL_TALENT_ADAPTATION_POLICY.weights;
  const scores = weights.map(() => ({ error: 0, rows: 0 }));
  let originsScored = 0;
  const select = () =>
    originsScored < NHL_TALENT_ADAPTATION_POLICY.warmupOrigins
      ? 0
      : scores.reduce(
          (best, s, i) =>
            s.rows &&
            s.error / s.rows < scores[best]!.error / scores[best]!.rows
              ? i
              : best,
          0,
        );
  const results: ((typeof examples)[number] & { prediction: number })[] = [];
  const origins = [...new Set(rows.map((r) => r.originYear))].sort(
    (a, b) => a - b,
  );
  for (const origin of origins) {
    const selected = weights[select()]!;
    const test = examples.filter((r) => r.row.originYear === origin);
    for (const r of test) {
      results.push({
        ...r,
        prediction: r.row.predicted + selected * r.evidence.delta,
      });
      weights.forEach((w, i) => {
        scores[i]!.error +=
          (r.row.predicted + w * r.evidence.delta - r.row.actual) ** 2;
        scores[i]!.rows++;
      });
    }
    if (test.length) originsScored++;
  }
  const metric = (rs: typeof results): NhlTalentAdaptationMetrics => ({
    rows: rs.length,
    baseMse: rs.length
      ? rs.reduce((s, r) => s + (r.row.predicted - r.row.actual) ** 2, 0) /
        rs.length
      : null,
    adaptiveMse: rs.length
      ? rs.reduce((s, r) => s + (r.prediction - r.row.actual) ** 2, 0) /
        rs.length
      : null,
  });
  const changedOrigins = origins.filter((origin) =>
    results.some(
      (r) => r.row.originYear === origin && r.prediction !== r.row.predicted,
    ),
  );
  const winningOrigins = changedOrigins.filter((origin) => {
    const m = metric(results.filter((r) => r.row.originYear === origin));
    return m.adaptiveMse! < m.baseMse!;
  }).length;
  const overall = metric(results),
    lateGrowth = metric(results.filter((r) => r.evidence.lateGrowth));
  const selectedWeight = weights[select()]!;
  const adaptation: NhlTalentAdaptation = {
    version: "nhl-sustained-talent-v1",
    trainingThroughYear: cutoff,
    reliabilityMinutes: NHL_TALENT_ADAPTATION_POLICY.reliabilityMinutes,
    selectedWeight,
    appliedWeight: 0,
    status: "disabled",
    validation: {
      ...overall,
      origins: origins.length,
      changedOrigins: changedOrigins.length,
      winningOrigins,
      changedRows: results.filter((r) => r.prediction !== r.row.predicted)
        .length,
      lateGrowth,
      sustainedDecline: metric(
        results.filter((r) => r.evidence.direction === "decline"),
      ),
      unconfirmedJumps: metric(
        results.filter((r) => r.evidence.unconfirmedJump),
      ),
      staleHistory: metric(results.filter((r) => r.evidence.stale)),
      afterAbsence: metric(results.filter((r) => r.row.gapYears > 1)),
    },
  };
  if (supportsAdaptation(adaptation.validation)) {
    adaptation.appliedWeight = selectedWeight;
    adaptation.status = selectedWeight > 0 ? "experimental" : "disabled";
  }
  return {
    adaptation,
    // Final promotion may change with later labels; historical candidate
    // forecasts must remain exactly as selected at their own origins.
    predictions: new Map(results.map((r) => [r.key, r.prediction])),
  };
}

export function validateNhlTalentAdaptation(
  input: NhlTalentAdaptation,
  cutoff: number,
) {
  if (
    input?.version !== "nhl-sustained-talent-v1" ||
    input.trainingThroughYear !== cutoff ||
    input.reliabilityMinutes !==
      NHL_TALENT_ADAPTATION_POLICY.reliabilityMinutes ||
    ![0, 0.25, 0.5, 1].includes(input.selectedWeight) ||
    ![0, input.selectedWeight].includes(input.appliedWeight) ||
    input.status !== (input.appliedWeight > 0 ? "experimental" : "disabled")
  )
    throw Error("Invalid NHL talent adaptation");
  const v = input.validation;
  if (
    !v ||
    [v.rows, v.origins, v.changedRows, v.changedOrigins, v.winningOrigins].some(
      (n) => !Number.isSafeInteger(n) || n < 0,
    ) ||
    v.changedRows > v.rows ||
    v.winningOrigins > v.changedOrigins ||
    v.changedOrigins > v.origins ||
    [
      v,
      v.lateGrowth,
      v.sustainedDecline,
      v.unconfirmedJumps,
      v.staleHistory,
      v.afterAbsence,
    ].some(
      (m) =>
        !m ||
        !Number.isSafeInteger(m.rows) ||
        m.rows < 0 ||
        m.rows > v.rows ||
        (m.rows === 0
          ? m.baseMse !== null || m.adaptiveMse !== null
          : m.baseMse === null || m.adaptiveMse === null) ||
        [m.baseMse, m.adaptiveMse].some(
          (n) => n !== null && (!Number.isFinite(n) || n < 0),
        ),
    )
  )
    throw Error("Invalid NHL adaptation validation");
  if (
    input.appliedWeight !== (supportsAdaptation(v) ? input.selectedWeight : 0)
  )
    throw Error("Unsupported NHL talent adaptation");
}

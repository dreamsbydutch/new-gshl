import { NHL_SALARY_CAP_BY_START_YEAR } from "../../../../src/lib/utils/domain/nhl-salary-caps";
import {
  correlation,
  quantile,
  ranks,
  spearman,
} from "./nhl-rating-diagnostics";

export type SalarySeason = {
  startYear: number;
  ratings: {
    nhlPlayerId: number;
    playerId: string | null;
    name: string;
    position: "F" | "D" | "G";
    games: number;
    status: string;
    seasonValue: number | null;
    abilityPer60: number | null;
    seasonRating: number | null;
    limitedSeason: boolean;
  }[];
  contracts: {
    playerId: string;
    contractId: string;
    capHit: number;
    cashSalary: number | null;
    signingStatus: string | null;
    signingAge: number | null;
    length: number | null;
    startYear: number | null;
    endYear: number | null;
    source: string;
    validHeader: boolean;
  }[];
};
type MatchIssue =
  | "unlinked-player"
  | "missing-contract"
  | "ambiguous-contract"
  | "invalid-contract"
  | null;
type ComparisonRow = SalarySeason["ratings"][number] & {
  startYear: number;
  salaryCap: number;
  capHit: number | null;
  cashSalary: number | null;
  capSharePct: number | null;
  signingStatus: string;
  signingAge: number | null;
  contractLength: number | null;
  contractSource: string | null;
  matchIssue: MatchIssue;
  cohortCount: number;
  cohortCoverage: number | null;
  benchmarkEligible: boolean;
  payPercentile: number | null;
  valuePercentile: number | null;
  abilityPercentile: number | null;
  valuePayGap: number | null;
  abilityPayGap: number | null;
  valuePeers: PeerRange | null;
  abilityPeers: PeerRange | null;
  salaryPeers: RatingRange | null;
};
type PeerRange = { n: number; median: number; p25: number; p75: number };
type RatingRange = {
  n: number;
  valueMedian: number;
  valueP25: number;
  valueP75: number;
  abilityMedian: number | null;
};
const finite = (n: number | null): n is number =>
  n !== null && Number.isFinite(n);
const percentile = (values: number[]) =>
  ranks(values).map((r) =>
    values.length < 2 ? 50 : (100 * (values.length - r)) / (values.length - 1),
  );
const priceRange = (peers: ComparisonRow[]): PeerRange | null =>
  peers.length < 15
    ? null
    : {
        n: peers.length,
        median: quantile(
          peers.map((p) => p.capHit!),
          0.5,
        )!,
        p25: quantile(
          peers.map((p) => p.capHit!),
          0.25,
        )!,
        p75: quantile(
          peers.map((p) => p.capHit!),
          0.75,
        )!,
      };

/** Descriptive same-season comparisons, not a contract pricing or prediction model. */
export function compareNhlSalaries(seasons: readonly SalarySeason[]) {
  const identities = new Set<string>();
  const rows: ComparisonRow[] = [];
  for (const season of seasons) {
    const salaryCap = NHL_SALARY_CAP_BY_START_YEAR[season.startYear];
    if (!salaryCap || season.startYear > 2025 || season.startYear < 2013)
      throw new Error("Missing historical cap or unsupported season");
    for (const r of season.ratings) {
      const key = `${season.startYear}:${r.nhlPlayerId}`;
      if (identities.has(key))
        throw new Error("Duplicate player-season rating");
      identities.add(key);
      const matches = r.playerId
        ? season.contracts.filter((c) => c.playerId === r.playerId)
        : [];
      const c = matches.length === 1 ? matches[0]! : null;
      const matchIssue: MatchIssue = !r.playerId
        ? "unlinked-player"
        : matches.length === 0
          ? "missing-contract"
          : matches.length > 1
            ? "ambiguous-contract"
            : !c!.validHeader ||
                !Number.isFinite(c!.capHit) ||
                c!.capHit <= 0 ||
                c!.startYear === null ||
                c!.endYear === null ||
                c!.startYear > season.startYear ||
                c!.endYear < season.startYear
              ? "invalid-contract"
              : null;
      const valid = matchIssue === null ? c : null;
      rows.push({
        ...r,
        startYear: season.startYear,
        salaryCap,
        capHit: valid?.capHit ?? null,
        cashSalary: valid?.cashSalary ?? null,
        capSharePct: valid ? (100 * valid.capHit) / salaryCap : null,
        signingStatus: valid?.signingStatus?.trim() || "unknown",
        signingAge: valid?.signingAge ?? null,
        contractLength: valid?.length ?? null,
        contractSource: valid?.source ?? null,
        matchIssue,
        cohortCount: 0,
        cohortCoverage: null,
        benchmarkEligible: false,
        payPercentile: null,
        valuePercentile: null,
        abilityPercentile: null,
        valuePayGap: null,
        abilityPayGap: null,
        valuePeers: null,
        abilityPeers: null,
        salaryPeers: null,
      });
    }
  }
  const cohorts = [];
  for (const startYear of [...new Set(rows.map((r) => r.startYear))].sort()) {
    for (const position of ["F", "D", "G"] as const) {
      const all = rows.filter(
        (r) => r.startYear === startYear && r.position === position,
      );
      const qualified = all.filter(
        (r) => r.status === "rated" && finite(r.seasonValue),
      );
      const matched = qualified.filter((r) => r.matchIssue === null);
      const coverage = qualified.length ? matched.length / qualified.length : 0;
      // Minimum coverage is an explicit reporting guard, not proof missingness is random.
      const eligible =
        coverage >= 0.8 &&
        matched.length >= 30 &&
        !all.some((r) => r.limitedSeason);
      const pay = percentile(matched.map((r) => r.capHit!));
      const value = percentile(matched.map((r) => r.seasonValue!));
      const withAbility = matched.filter((r) => finite(r.abilityPer60));
      const ability = percentile(withAbility.map((r) => r.abilityPer60!));
      const abilityPay = percentile(withAbility.map((r) => r.capHit!));
      for (const r of all) {
        r.cohortCoverage = coverage;
        r.cohortCount = matched.length;
      }
      matched.forEach((r, i) => {
        r.benchmarkEligible = eligible;
        if (!eligible) return;
        r.payPercentile = pay[i]!;
        r.valuePercentile = value[i]!;
        r.valuePayGap = value[i]! - pay[i]!;
        const a = withAbility.indexOf(r);
        if (a >= 0) {
          r.abilityPercentile = ability[a]!;
          r.abilityPayGap = ability[a]! - abilityPay[a]!;
        }
      });
      if (eligible)
        for (const r of matched) {
          // Preserve source signing categories; never guess ELC/UFA from age or salary.
          if (r.signingStatus === "unknown") continue;
          const peers = matched.filter(
            (p) =>
              p.nhlPlayerId !== r.nhlPlayerId &&
              p.signingStatus === r.signingStatus,
          );
          r.valuePeers = priceRange(
            peers.filter(
              (p) => Math.abs(p.valuePercentile! - r.valuePercentile!) <= 10,
            ),
          );
          if (r.abilityPercentile !== null)
            r.abilityPeers = priceRange(
              peers.filter(
                (p) =>
                  p.abilityPercentile !== null &&
                  Math.abs(p.abilityPercentile - r.abilityPercentile!) <= 10,
              ),
            );
          const paidPeers = peers.filter(
            (p) => Math.abs(p.payPercentile! - r.payPercentile!) <= 10,
          );
          if (paidPeers.length >= 15)
            r.salaryPeers = {
              n: paidPeers.length,
              valueMedian: quantile(
                paidPeers.map((p) => p.seasonValue!),
                0.5,
              )!,
              valueP25: quantile(
                paidPeers.map((p) => p.seasonValue!),
                0.25,
              )!,
              valueP75: quantile(
                paidPeers.map((p) => p.seasonValue!),
                0.75,
              )!,
              abilityMedian: quantile(
                paidPeers.map((p) => p.abilityPer60).filter(finite),
                0.5,
              ),
            };
        }
      cohorts.push({
        startYear,
        position,
        total: all.length,
        qualified: qualified.length,
        matchedQualified: matched.length,
        coverage,
        eligible,
        matchedAll: all.filter((r) => !r.matchIssue).length,
        capVsValuePearson: eligible
          ? correlation(
              matched.map((r) => r.capSharePct!),
              matched.map((r) => r.seasonValue!),
            )
          : null,
        capVsValueSpearman: eligible
          ? spearman(
              matched.map((r) => r.capSharePct!),
              matched.map((r) => r.seasonValue!),
            )
          : null,
        capVsAbilitySpearman: eligible
          ? spearman(
              withAbility.map((r) => r.capSharePct!),
              withAbility.map((r) => r.abilityPer60!),
            )
          : null,
      });
    }
  }
  return { rows, cohorts };
}

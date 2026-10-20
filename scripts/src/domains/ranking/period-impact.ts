import { readFile } from "node:fs/promises";
import vm from "node:vm";
import type {
  DayImpactContext,
  DayImpactPolicy,
  DayImpactReference,
} from "./player-day-impact";

export type PeriodImpactBlock = {
  role: "skater" | "goalie" | "team";
  raw: Record<string, number>;
  availableFields?: readonly string[];
  skaterAppearances: number;
  goalieAppearances: number;
};
export type PeriodImpactFitOptions = DayImpactPolicy & {
  trainedBefore: string;
  contextModel: "schedule-kernel";
  exposureBandwidth: number;
  referencePolicy: "retrospective-fixed" | "before-week";
  backgroundWeighting?: "side-week" | "appearance";
  countModel?: "empirical";
};
export type PeriodImpactReference = {
  version: "gshl-period-category-impact-v1";
  dailyReference: DayImpactReference;
  sides: readonly unknown[];
  referencePolicy: PeriodImpactFitOptions["referencePolicy"];
  provenance: Record<string, unknown> & { trainedBefore: string };
};
export type PeriodImpactScoreOptions = {
  categories: readonly string[];
  weekDays: number;
  nhlGamesPerTeam: number;
  goalieMinimum: number;
  weekStartDate?: string;
  blockKind: "replacement" | "whole-team-week";
};
export type PeriodImpactResult = {
  status: "rated" | "no-appearance" | "unavailable";
  value: number | null;
  ifStarted: number | null;
  counted: number | null;
  average: number | null;
  appearances: number;
  categoryContributions: Record<string, number>;
  qualificationContributions: Record<string, number>;
  reasons: string[];
  support: Record<string, number>;
  reference: Record<string, unknown>;
  blockKind: PeriodImpactScoreOptions["blockKind"];
};
export type PeriodImpactApi = {
  fitBlockContexts: (
    contexts: readonly DayImpactContext[],
    options: PeriodImpactFitOptions,
  ) => PeriodImpactReference;
  scoreBlock: (
    block: PeriodImpactBlock,
    reference: PeriodImpactReference,
    options: PeriodImpactScoreOptions,
  ) => PeriodImpactResult;
  hydrateBlockReference: (input: unknown) => PeriodImpactReference;
};
let apiPromise: Promise<PeriodImpactApi> | undefined;
/** Local, deterministic calculation only. No storage, source fetching or grouping. */
export function loadPeriodImpact(): Promise<PeriodImpactApi> {
  apiPromise ??= (async () => {
    const context = vm.createContext({ RankingEngine: {} });
    for (const file of ["player-day-impact.js", "period-impact.js"]) {
      const source = await readFile(
        new URL(`../../runtime/RankingEngine/${file}`, import.meta.url),
        "utf8",
      );
      vm.runInContext(source, context, { filename: `RankingEngine/${file}` });
    }
    const api: PeriodImpactApi = context.RankingEngine.PeriodImpact;
    if (
      typeof api?.fitBlockContexts !== "function" ||
      typeof api.scoreBlock !== "function" ||
      typeof api.hydrateBlockReference !== "function"
    )
      throw Error("Period category-impact runtime unavailable");
    return api;
  })();
  return apiPromise;
}

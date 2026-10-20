import type { PerformanceRow } from "./performances";

export type RecordSubject = "player" | "team";
export type RecordPeriod = "career" | "season" | "week";

export interface CareerAggregate {
  row: PerformanceRow;
  completeGaa: boolean;
  completeSvp: boolean;
}

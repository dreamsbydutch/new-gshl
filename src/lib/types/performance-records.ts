export interface RecordObservation {
  id: string;
  entityId: string;
  kind: "team" | "player";
  stats: Record<string, unknown>;
  label: string;
  matchupId: string;
}
export interface PerformanceRecordBadge {
  entityId: string;
  stat: string;
  direction: "low" | "high";
  tied: boolean;
  provisional: boolean;
  value: number;
  previous: number;
  compared: number;
  ties: number;
  examples: {
    label: string;
    matchupId: string;
    entityId: string;
    kind: "team" | "player";
  }[];
}
export interface MatchupRecords {
  badges: PerformanceRecordBadge[];
  scope: string;
}

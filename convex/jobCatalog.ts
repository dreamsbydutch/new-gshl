import { v } from "convex/values";

export const JOB_STATUSES = [
  "queued",
  "running",
  "waiting_external",
  "succeeded",
  "failed",
  "cancelling",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting_external"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelling"),
  v.literal("cancelled"),
);

export const JOB_NAMES = [
  "season-stat-aggregation",
  "player-rating-rebuild",
  "team-rating-rebuild",
  "power-rating-rebuild",
  "standings-backfill",
  "awards-backfill",
  "lineup-recalculation",
  "nhl-player-id-backfill",
  "nhl-daily-stat-sync",
  "hockey-reference-backfill",
  "yahoo-player-id-backfill",
  "yahoo-matchup-player-day-backfill",
  "yahoo-weekly-validation",
  "puckpedia-player-bio-sync",
  "active-season-refresh",
] as const;

export type JobName = (typeof JOB_NAMES)[number];

const aliases: Record<string, JobName> = {
  "ratings:backfill": "player-rating-rebuild",
  "ratings:rebuild-all": "player-rating-rebuild",
  "ratings:rebuild-team": "team-rating-rebuild",
  "power:rebuild": "power-rating-rebuild",
  "standings:backfill": "standings-backfill",
  "awards:backfill": "awards-backfill",
  "stats:aggregate-season": "season-stat-aggregation",
  "lineup:update-all": "lineup-recalculation",
  "player-bios:backfill-nhl-ids": "nhl-player-id-backfill",
  "stats:sync-nhl-daily": "nhl-daily-stat-sync",
  "stats:backfill-hockey-reference": "hockey-reference-backfill",
  "player-bios:backfill-yahoo-ids": "yahoo-player-id-backfill",
  "stats:backfill-yahoo-matchup-days": "yahoo-matchup-player-day-backfill",
  "stats:backfill-yahoo-rosters": "yahoo-matchup-player-day-backfill",
  "yahoo:check-weekly-player-days": "yahoo-weekly-validation",
  "yahoo:check-weekly-matchups": "yahoo-weekly-validation",
  "player-bios:sync": "puckpedia-player-bio-sync",
};

const names = new Set<string>(JOB_NAMES);

export function canonicalJobName(value: string): JobName {
  const canonical = aliases[value] ?? value;
  if (!names.has(canonical)) throw new Error(`Unknown job: ${value}`);
  return canonical as JobName;
}

export function isExternalJob(jobName: JobName): boolean {
  return [
    "nhl-player-id-backfill",
    "nhl-daily-stat-sync",
    "hockey-reference-backfill",
    "yahoo-player-id-backfill",
    "yahoo-matchup-player-day-backfill",
    "yahoo-weekly-validation",
    "puckpedia-player-bio-sync",
  ].includes(jobName);
}

export function buildLockKey(jobName: JobName, args: Record<string, unknown>) {
  const scope = ["seasonId", "weekId", "matchupId", "date"]
    .map((key) => {
      const value = args[key];
      const text =
        value === undefined || value === null
          ? "*"
          : typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value);
      return `${key}=${text}`;
    })
    .join("|");
  return `${jobName}|${scope}`;
}

export const ACTIVE_REFRESH_STAGES: readonly JobName[] = [
  "nhl-daily-stat-sync",
  "season-stat-aggregation",
  "player-rating-rebuild",
  "team-rating-rebuild",
  "power-rating-rebuild",
  "standings-backfill",
];

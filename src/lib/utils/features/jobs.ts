import type { JobRun, JobRunProgress } from "@gshl-types";
import type { Id } from "@gshl-convex/_generated/dataModel";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function isJobRunId(value: unknown): value is Id<"jobRuns"> {
  return typeof value === "string" && value.length > 0;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeProgress(value: unknown): JobRunProgress {
  if (!isRecord(value)) return {};
  return {
    processed: optionalNumber(value.processed),
    updated: optionalNumber(value.updated),
  };
}

export function normalizeJobRuns(value: unknown): JobRun[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((run) => {
    if (!isRecord(run)) return [];
    const id = run.id ?? run._id;
    if (!isJobRunId(id)) return [];
    const error = stringValue(run.error);
    return [
      {
        id,
        jobName: stringValue(run.jobName),
        requestedBy: stringValue(run.requestedBy),
        apply: run.apply === true,
        mode: stringValue(run.mode),
        status: stringValue(run.status),
        progress: normalizeProgress(run.progress),
        ...(error ? { error } : {}),
        startedAt: optionalNumber(run.startedAt),
        createdAt: optionalNumber(run.createdAt),
      },
    ];
  });
}

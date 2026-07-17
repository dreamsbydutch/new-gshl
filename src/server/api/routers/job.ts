import { z } from "zod";
import { callConvex } from "@gshl-lib/data/convex-store";
import { commissionerProcedure, createTRPCRouter } from "../trpc";

const runIdInput = z.object({ runId: z.string().min(1) });

export const jobRouter = createTRPCRouter({
  catalog: commissionerProcedure.query(() =>
    callConvex<{ jobs: string[]; statuses: string[] }>(
      "query",
      "jobs:catalog",
      {},
    ),
  ),
  list: commissionerProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(({ input }) =>
      callConvex<JobRun[]>("query", "jobs:list", input ?? { limit: 50 }),
    ),
  inspect: commissionerProcedure
    .input(runIdInput)
    .query(({ input }) =>
      callConvex<JobInspection | null>("query", "jobs:inspect", input),
    ),
  start: commissionerProcedure
    .input(
      z.object({
        jobName: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
        apply: z.boolean().default(false),
      }),
    )
    .mutation(({ input, ctx }) =>
      callConvex<JobRun>("mutation", "jobs:start", {
        ...input,
        requestedBy:
          ctx.session?.user?.email ?? ctx.session?.user?.name ?? "commissioner",
      }),
    ),
  cancel: commissionerProcedure
    .input(runIdInput)
    .mutation(({ input }) =>
      callConvex<JobRun>("mutation", "jobs:cancel", input),
    ),
  retry: commissionerProcedure.input(runIdInput).mutation(({ input, ctx }) =>
    callConvex<JobRun>("mutation", "jobs:retry", {
      ...input,
      requestedBy:
        ctx.session?.user?.email ?? ctx.session?.user?.name ?? "commissioner",
    }),
  ),
  schedules: commissionerProcedure.query(() =>
    callConvex<JobSchedule[]>("query", "jobs:listSchedules", {}),
  ),
  createSchedule: commissionerProcedure
    .input(
      z.object({
        name: z.string().min(1),
        jobName: z.string().min(1),
        args: z.record(z.string(), z.unknown()).default({}),
        apply: z.boolean().default(false),
        enabled: z.boolean().default(false),
        intervalMinutes: z.number().int().min(1),
        nextRunAt: z.number().optional(),
      }),
    )
    .mutation(({ input }) =>
      callConvex<string>("mutation", "jobs:createSchedule", input),
    ),
  setScheduleEnabled: commissionerProcedure
    .input(z.object({ scheduleId: z.string().min(1), enabled: z.boolean() }))
    .mutation(({ input }) =>
      callConvex<void>("mutation", "jobs:setScheduleEnabled", input),
    ),
});

export type JobRun = {
  id: string;
  jobName: string;
  args: Record<string, unknown>;
  apply: boolean;
  mode: string;
  status: string;
  progress?: Record<string, number>;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  requestedBy?: string;
};

type JobSchedule = {
  _id: string;
  name: string;
  jobName: string;
  apply: boolean;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: number;
};

type JobInspection = {
  run: JobRun;
  events: Array<{
    _id: string;
    level: string;
    message: string;
    createdAt: number;
  }>;
  artifacts: unknown[];
  tasks: unknown[];
  children: JobRun[];
};

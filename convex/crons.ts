import { cronJobs } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";

const crons = cronJobs();
const tickSchedules = makeFunctionReference<"mutation">(
  "jobRunner:tickSchedules",
) as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, never>,
  unknown
>;
crons.interval("dispatch due job schedules", { minutes: 1 }, tickSchedules, {});

export default crons;

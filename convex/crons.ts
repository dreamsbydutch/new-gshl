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
const reconcileUfaOffers = makeFunctionReference<"mutation">(
  "ufa:reconcileDueGroups",
) as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, never>,
  unknown
>;
const scanDueWeeklyEditionMilestones = makeFunctionReference<"mutation">(
  "weeklyEditions:scanDueMilestones",
) as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, never>,
  unknown
>;
crons.interval("dispatch due job schedules", { minutes: 5 }, tickSchedules, {});
crons.interval(
  "resolve due UFA offer groups",
  { minutes: 15 },
  reconcileUfaOffers,
  {},
);
crons.interval(
  "publish due GSHL Weekly milestone editions",
  { hours: 6 },
  scanDueWeeklyEditionMilestones,
  {},
);

export default crons;

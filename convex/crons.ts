import { cronJobs } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { internal } from "./_generated/api";

// Only production should opt in; unused dev backends stay idle.
const crons = cronJobs();
if (process.env.GSHL_AUTOMATION_ENABLED === "true")
  crons.daily(
    "write matchup previews (Eastern daylight time)",
    { hourUTC: 8, minuteUTC: 0 },
    internal.matchupPreviews.scan,
    {},
  );
if (process.env.GSHL_AUTOMATION_ENABLED === "true")
  crons.daily(
    "write matchup previews (Eastern standard time)",
    { hourUTC: 9, minuteUTC: 0 },
    internal.matchupPreviews.scan,
    {},
  );
if (process.env.GSHL_AUTOMATION_ENABLED === "true")
  crons.interval(
    "deliver due notifications",
    { minutes: 1 },
    internal.notificationScanner.scan,
    {},
  );
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
if (process.env.GSHL_AUTOMATION_ENABLED === "true")
  crons.interval(
    "dispatch due job schedules",
    { minutes: 15 },
    tickSchedules,
    {},
  );
if (process.env.GSHL_AUTOMATION_ENABLED === "true")
  crons.interval(
    "resolve due UFA offer groups",
    { minutes: 15 },
    reconcileUfaOffers,
    {},
  );
if (process.env.GSHL_AUTOMATION_ENABLED === "true")
  crons.interval(
    "publish due GSHL Weekly editions",
    { minutes: 15 },
    scanDueWeeklyEditionMilestones,
    {},
  );

export default crons;

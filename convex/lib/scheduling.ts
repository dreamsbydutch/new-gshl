import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";
import { ConvexError } from "convex/values";

/** Preview deployments can opt out without changing production's timers. */
export function scheduledFunctionsEnabled() {
  return process.env.GSHL_SCHEDULED_FUNCTIONS_ENABLED !== "false";
}

function requireScheduling() {
  if (!scheduledFunctionsEnabled()) {
    throw new ConvexError(
      "Background processing is disabled in this environment.",
    );
  }
}

export async function scheduleAfter<Ref extends SchedulableFunctionReference>(
  ctx: { scheduler: Scheduler },
  delayMs: number,
  reference: Ref,
  ...args: OptionalRestArgs<Ref>
) {
  requireScheduling();
  return ctx.scheduler.runAfter(delayMs, reference, ...args);
}

export async function scheduleAt<Ref extends SchedulableFunctionReference>(
  ctx: { scheduler: Scheduler },
  timestamp: number | Date,
  reference: Ref,
  ...args: OptionalRestArgs<Ref>
) {
  requireScheduling();
  return ctx.scheduler.runAt(timestamp, reference, ...args);
}

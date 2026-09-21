import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Owner identity is independent of current league participation. */
export async function validateAuthUserOwnerLink(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"authUsers">,
  role: "viewer" | "owner" | "commissioner",
  ownerId?: Id<"owners">,
): Promise<Id<"owners"> | undefined> {
  if (role === "viewer") return undefined;
  if (!ownerId) {
    if (role === "owner") {
      throw new Error("Owners must be linked to an owner record");
    }
    return undefined;
  }
  const owner = await ctx.db.get(ownerId);
  if (!owner) throw new Error("Owner link must reference an existing owner");

  const linked = await ctx.db
    .query("authUsers")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .take(2);
  if (linked.some((user) => user._id !== userId)) {
    throw new Error("That owner is already linked to another account");
  }
  return ownerId;
}

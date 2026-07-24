import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;
type CurrentUser = NonNullable<
  Awaited<ReturnType<AuthCtx["db"]["get"]>>
>;

export async function requireActiveUser(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  const user = await ctx.db.get(identity.subject as Id<"authUsers">);
  if (user?.status !== "active") throw new Error("Unauthenticated");
  return user;
}

export async function requireOwnerOrCommissioner(ctx: AuthCtx) {
  const user = await requireActiveUser(ctx);
  if (user.role !== "owner" && user.role !== "commissioner") {
    throw new Error("Forbidden");
  }
  return user;
}

export async function requireCommissioner(ctx: AuthCtx) {
  const user = await requireActiveUser(ctx);
  if (user.role !== "commissioner") throw new Error("Forbidden");
  return user;
}

export async function requireOwnerAccess(
  ctx: AuthCtx,
  ownerId: Id<"owners">,
) {
  const user = await requireOwnerOrCommissioner(ctx);
  if (user.role !== "commissioner" && user.ownerId !== ownerId) {
    throw new Error("Forbidden");
  }
  return user;
}

export type { CurrentUser };

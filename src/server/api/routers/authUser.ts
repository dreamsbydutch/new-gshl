import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  commissionerProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "../trpc";
import { listAuthUsers, updateAuthUserAccess } from "@gshl-lib/auth/user-store";
import { getMany } from "../sheets-store";
import type { Owner } from "@gshl-types";

export const authUserRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),
  list: commissionerProcedure.query(async () => listAuthUsers()),
  owners: commissionerProcedure.query(async () => {
    const owners = await getMany<Owner>("Owner", {
      where: { isActive: true },
      orderBy: { lastName: "asc", firstName: "asc" },
    });
    return owners.map(({ id, firstName, lastName, nickName, isActive }) => ({
      id,
      firstName,
      lastName,
      nickName,
      isActive,
    }));
  }),
  updateAccess: commissionerProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.enum(["viewer", "owner", "commissioner"]),
        status: z.enum(["active", "disabled"]),
        ownerId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (
        input.id === ctx.session.user.id &&
        (input.role !== "commissioner" || input.status !== "active")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot remove or disable your own commissioner access.",
        });
      }
      return updateAuthUserAccess(input);
    }),
});

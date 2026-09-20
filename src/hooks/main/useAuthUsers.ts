"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AuthOwnerOption, AuthUser, Owner } from "@gshl-types";
import type { FunctionArgs } from "convex/server";
import { useDomainMutation } from "./useDomainMutation";

export function useAuthUserAdmin() {
  const usersResult = useQuery(api.frontend.authUsers, {});
  const ownersResult = useQuery(api.frontend.owners, {
    where: { isActive: true },
    orderBy: { lastName: "asc", firstName: "asc" },
  });
  return {
    users: {
      data: (usersResult ?? []) as unknown as AuthUser[],
      isLoading: usersResult === undefined,
      error: null,
    },
    owners: {
      data: ((ownersResult ?? []) as unknown as Owner[]).map(
        ({ id, firstName, lastName, nickName, isActive }) => ({
          id,
          firstName,
          lastName,
          nickName,
          isActive,
        }),
      ) as AuthOwnerOption[],
      isLoading: ownersResult === undefined,
      error: null,
    },
  };
}

export function useUpdateAuthUserAccess() {
  return useDomainMutation(
    api.frontend.updateAuthUserAccess,
    (
      args: Omit<
        FunctionArgs<typeof api.frontend.updateAuthUserAccess>,
        "id" | "ownerId"
      > & { id: string; ownerId?: string },
    ) => ({
      ...args,
      id: args.id as Id<"authUsers">,
      ownerId: args.ownerId as Id<"owners"> | undefined,
    }),
  );
}

"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { AuthOwnerOption, AuthUser, Owner } from "@gshl-types";
import { useAppMutation } from "./useAppMutation";

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
  return useAppMutation(api.frontend.updateAuthUserAccess);
}

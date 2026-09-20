"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs, OptionalRestArgs } from "convex/server";
import type { MutationReference } from "@gshl-types";
import { useAppWrite } from "./useAppWrite";

/** Adapt domain values inside the shared execution lifecycle, including failures. */
export function useDomainMutation<Mutation extends MutationReference, TArgs>(
  reference: Mutation,
  toConvexArgs: (args: TArgs) => FunctionArgs<Mutation>,
) {
  const execute = useMutation(reference);
  const executeDomain = useCallback(
    async (args: TArgs) =>
      execute(...([toConvexArgs(args)] as OptionalRestArgs<Mutation>)),
    [execute, toConvexArgs],
  );
  return useAppWrite(executeDomain);
}

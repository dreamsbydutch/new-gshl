"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import type {
  FunctionArgs,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import type { AppMutationOptions, MutationReference } from "@gshl-types";
import { useAppWrite } from "./useAppWrite";

export function useAppMutation<Mutation extends MutationReference>(
  reference: Mutation,
) {
  const { mutateAsync, isPending, error } = useAppWrite(useMutation(reference));

  const mutate = useCallback(
    (
      args: FunctionArgs<Mutation>,
      options?: AppMutationOptions<FunctionReturnType<Mutation>>,
    ) => {
      // Convex allows omission for empty arguments; a supplied argument is valid
      // in either case, which TS cannot prove for this conditional tuple type.
      void mutateAsync(...([args] as OptionalRestArgs<Mutation>))
        .then((value) => options?.onSuccess?.(value))
        .catch((caught: Error) => options?.onError?.(caught))
        .finally(() => options?.onSettled?.());
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending, error };
}

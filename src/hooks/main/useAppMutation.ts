"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import type { MutationReference } from "@gshl-types";

export function useAppMutation<Mutation extends MutationReference>(
  reference: Mutation,
) {
  const execute = useMutation(reference);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(
    async (args: Record<string, unknown>) => {
      setIsPending(true);
      setError(null);
      try {
        return await execute(...([args] as Parameters<typeof execute>));
      } catch (caught) {
        const nextError =
          caught instanceof Error ? caught : new Error(String(caught));
        setError(nextError);
        throw nextError;
      } finally {
        setIsPending(false);
      }
    },
    [execute],
  );

  const mutate = useCallback(
    (
      args: Record<string, unknown>,
      options?: {
        onSuccess?: (value: unknown) => void;
        onError?: (error: Error) => void;
        onSettled?: () => void;
      },
    ) => {
      void mutateAsync(args)
        .then((value) => options?.onSuccess?.(value))
        .catch((caught: Error) => options?.onError?.(caught))
        .finally(() => options?.onSettled?.());
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending, error };
}

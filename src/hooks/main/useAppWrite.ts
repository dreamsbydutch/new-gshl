"use client";

import { useCallback, useRef, useState } from "react";
import { normalizeError } from "@gshl-utils/core/error";
import type { AppMutationOptions } from "@gshl-types";

/** Shared execution lifecycle for the mutation and action adapters. */
export function useAppWrite<TArgs extends [args?: unknown], TResult>(
  execute: (...args: TArgs) => Promise<TResult>,
) {
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const latestCall = useRef(0);

  const mutateAsync = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      const call = ++latestCall.current;
      setPendingCount((count) => count + 1);
      setError(null);
      try {
        return await execute(...args);
      } catch (caught) {
        const nextError = normalizeError(caught);
        // Older calls still reject independently, but cannot replace newer state.
        if (call === latestCall.current) setError(nextError);
        throw nextError;
      } finally {
        setPendingCount((count) => count - 1);
      }
    },
    [execute],
  );

  const mutate = useCallback(
    (args: TArgs[0], options?: AppMutationOptions<TResult>) => {
      // Supplying the sole argument is valid for both required and optional
      // tuples; TS cannot establish this for a generic tuple constraint.
      void mutateAsync(...([args] as unknown as TArgs))
        .then((value) => options?.onSuccess?.(value))
        .catch((caught: Error) => options?.onError?.(caught))
        .finally(() => options?.onSettled?.());
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending: pendingCount > 0, error };
}

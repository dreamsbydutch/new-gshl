"use client";

import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import type { ActionReference } from "@gshl-types";

export function useAppAction<Action extends ActionReference>(
  reference: Action,
) {
  const execute = useAction(reference);
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

  return { mutateAsync, isPending, error };
}

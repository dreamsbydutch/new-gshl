"use client";

import { clientApi as api } from "@gshl-trpc";

export function useUfaOverview() {
  return api.ufa.getOverview.useQuery(undefined, { refetchInterval: 30_000 });
}

export function useSubmitUfaOffer(options?: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}) {
  const utils = api.useUtils();
  return api.ufa.submitOffer.useMutation({
    onSuccess: async () => {
      await utils.ufa.getOverview.invalidate();
      options?.onSuccess?.();
    },
    onError: (error) => options?.onError?.(error.message),
  });
}

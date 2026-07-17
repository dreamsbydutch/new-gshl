import { api } from "@gshl-trpc/react";

export function useJobAdmin() {
  const utils = api.useUtils();
  const refresh = () => void utils.job.list.invalidate();
  return {
    catalog: api.job.catalog.useQuery(),
    runs: api.job.list.useQuery({ limit: 50 }, { refetchInterval: 5000 }),
    start: api.job.start.useMutation({ onSuccess: refresh }),
    cancel: api.job.cancel.useMutation({ onSuccess: refresh }),
    retry: api.job.retry.useMutation({ onSuccess: refresh }),
  };
}

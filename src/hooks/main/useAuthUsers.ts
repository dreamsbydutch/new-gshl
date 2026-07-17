import { api } from "@gshl-trpc/react";

export function useAuthUserAdmin() {
  const users = api.authUser.list.useQuery();
  const owners = api.authUser.owners.useQuery();
  return { users, owners };
}

export function useUpdateAuthUserAccess() {
  const utils = api.useUtils();
  return api.authUser.updateAccess.useMutation({
    onSuccess: async () => utils.authUser.list.invalidate(),
  });
}

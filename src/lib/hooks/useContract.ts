import { api } from "src/trpc/react";

export function useAllContracts() {
  const data = api.contract.getAll.useQuery({});
  return {
    ...data,
    data: data.data,
  };
}

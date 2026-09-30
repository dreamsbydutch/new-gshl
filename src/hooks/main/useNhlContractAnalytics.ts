"use client";

import { useEffect } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAppMutation } from "./useAppMutation";

export function useNhlContractAnalytics() {
  const contracts = usePaginatedQuery(
    api.nhlContractAnalytics.page,
    {},
    { initialNumItems: 100 },
  );
  const salaryCaps = useQuery(api.nhlContractAnalytics.salaryCaps, {});
  const { status, loadMore } = contracts;
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(100);
  }, [status, loadMore]);
  return {
    contracts: contracts.results,
    salaryCaps,
    isLoading: status !== "Exhausted" || salaryCaps === undefined,
    saveSalaryCaps: useAppMutation(api.nhlContractAnalytics.saveSalaryCaps),
  };
}

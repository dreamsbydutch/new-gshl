"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { useAppMutation } from "./useAppMutation";

export function useTradeBlockMarket(enabled = true) {
  const data = useQuery(api.tradeBlock.market, enabled ? {} : "skip");
  return {
    data,
    isLoading: enabled && data === undefined,
    save: useAppMutation(api.tradeBlock.save),
    remove: useAppMutation(api.tradeBlock.remove),
  };
}

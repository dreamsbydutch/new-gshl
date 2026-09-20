"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { FunctionArgs } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { useDomainMutation } from "./useDomainMutation";

export function useTradeBlockMarket(enabled = true) {
  const data = useQuery(api.tradeBlock.market, enabled ? {} : "skip");
  return {
    data,
    isLoading: enabled && data === undefined,
    save: useDomainMutation(
      api.tradeBlock.save,
      (
        args: Omit<FunctionArgs<typeof api.tradeBlock.save>, "playerId"> & {
          playerId: string;
        },
      ) => ({ ...args, playerId: args.playerId as Id<"players"> }),
    ),
    remove: useDomainMutation(
      api.tradeBlock.remove,
      (args: { listingId: string }) => ({
        ...args,
        listingId: args.listingId as Id<"tradeBlockEntries">,
      }),
    ),
  };
}

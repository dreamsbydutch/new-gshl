"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Contract, UseContractsOptions } from "@gshl-types";
import {
  applyContractFilters,
  normalizePlayerNhlSalaryRows,
  sortContracts,
} from "@gshl-utils";
import type { FunctionArgs } from "convex/server";
import { useDomainMutation } from "./useDomainMutation";

const EMPTY_CONTRACTS: Contract[] = [];

function singleFilterValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string"
  ) {
    return value[0];
  }
  return undefined;
}

export function useCreateContract() {
  return useDomainMutation(
    api.frontend.createContract,
    (
      args: Omit<
        FunctionArgs<typeof api.frontend.createContract>,
        "teamId" | "playerId"
      > & { teamId: string; playerId: string },
    ) => ({
      ...args,
      teamId: args.teamId as Id<"teams">,
      playerId: args.playerId as Id<"players">,
    }),
  );
}

/** Reads contracts with server scope and optional local filtering/sorting. */
export function useContracts(options: UseContractsOptions = {}) {
  const { filters, sort, take, enabled = true } = options;
  const serverWhere = {
    playerId: singleFilterValue(filters?.playerIds),
    ownerId: singleFilterValue(filters?.ownerIds),
    seasonId: singleFilterValue(filters?.seasonIds),
  };
  const hasServerWhere = Object.values(serverWhere).some(
    (value) => value !== undefined,
  );
  const result = useQuery(
    api.frontend.contracts,
    enabled ? (hasServerWhere ? { where: serverWhere } : {}) : "skip",
  );
  const contracts = (result ?? EMPTY_CONTRACTS) as unknown as Contract[];
  const data = useMemo(() => {
    const sorted = sortContracts(
      applyContractFilters(contracts, filters),
      sort,
    );
    return typeof take === "number" ? sorted.slice(0, take) : sorted;
  }, [contracts, filters, sort, take]);

  return { data, isLoading: enabled && result === undefined, error: null };
}

/** Reads salary history only for the players needed by contract projections. */
export function useContractPlayerNhlSalaries(
  playerIds: string[],
  enabled = true,
) {
  const shouldFetch = enabled && playerIds.length > 0;
  const result = useQuery(
    api.frontend.playerNhlSalaryHistory,
    shouldFetch ? { playerIds: playerIds as Id<"players">[] } : "skip",
  );
  const data = useMemo(() => normalizePlayerNhlSalaryRows(result), [result]);

  return { data, isLoading: shouldFetch && result === undefined, error: null };
}

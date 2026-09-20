"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useOwnerRankings() {
  const data = useQuery(api.frontend.ownerRankings, {});
  return { data, isLoading: data === undefined };
}

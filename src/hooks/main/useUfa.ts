"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { UfaCatalog, UfaOverviewMode } from "@gshl-types";
import { useAppMutation } from "./useAppMutation";

export function useUfaCatalog(mode: UfaOverviewMode, enabled = true) {
  const state = useQuery(api.ufa.publicState, enabled ? {} : "skip");
  const full = useQuery(
    api.frontend.ufaCatalog,
    enabled && mode === "full" ? {} : "skip",
  );
  const home = useQuery(
    api.frontend.ufaHomeCatalog,
    enabled && mode === "home" ? {} : "skip",
  );
  const catalog = (mode === "home" ? home : full) as unknown as
    | UfaCatalog
    | undefined;
  return {
    state,
    catalog,
    isLoading: enabled && (state === undefined || catalog === undefined),
  };
}

export function useUfaOfferMutation() {
  return useAppMutation(api.ufa.submitOffer);
}

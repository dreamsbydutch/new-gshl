"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { UfaCatalog, UfaOverviewMode } from "@gshl-types";
import { useAppMutation } from "./useAppMutation";

export function useUfaCatalog(mode: UfaOverviewMode) {
  const state = useQuery(api.ufa.publicState, {});
  const full = useQuery(api.frontend.ufaCatalog, mode === "full" ? {} : "skip");
  const home = useQuery(
    api.frontend.ufaHomeCatalog,
    mode === "home" ? {} : "skip",
  );
  const catalog = (mode === "home" ? home : full) as unknown as
    | UfaCatalog
    | undefined;
  return {
    state,
    catalog,
    isLoading: state === undefined || catalog === undefined,
  };
}

export function useUfaOfferMutation() {
  return useAppMutation(api.ufa.submitOffer);
}

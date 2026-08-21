"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useConferenceContestView() {
  const result = useQuery(api.conferenceContest.view, {});
  return {
    data: result,
    isLoading: result === undefined,
    error: null,
  };
}

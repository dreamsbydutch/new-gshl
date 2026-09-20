"use client";

import { useMutation } from "convex/react";
import type { MutationReference } from "@gshl-types";
import { useAppWrite } from "./useAppWrite";

export function useAppMutation<Mutation extends MutationReference>(
  reference: Mutation,
) {
  return useAppWrite(useMutation(reference));
}

"use client";

import { useAction } from "convex/react";
import type { ActionReference } from "@gshl-types";
import { useAppWrite } from "./useAppWrite";

export function useAppAction<Action extends ActionReference>(reference: Action) {
  const { mutateAsync, isPending, error } = useAppWrite(useAction(reference));
  return { mutateAsync, isPending, error };
}

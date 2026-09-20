import type { FunctionReference } from "convex/server";

export type MutationReference = FunctionReference<
  "mutation",
  "public",
  Record<string, unknown>,
  unknown
>;

export type ActionReference = FunctionReference<
  "action",
  "public",
  Record<string, unknown>,
  unknown
>;

export interface AppMutationOptions<TResult = unknown> {
  onSuccess?: (value: TResult) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
}

export interface AppMutationController<TArgs, TResult = unknown> {
  mutate: (args: TArgs, options?: AppMutationOptions<TResult>) => void;
  mutateAsync: (args: TArgs) => Promise<TResult>;
  isPending: boolean;
  error: Error | null;
}

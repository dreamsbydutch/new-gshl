import type { FunctionReference } from "convex/server";

export type MutationReference = FunctionReference<
  "mutation",
  "public",
  Record<string, unknown>,
  unknown
>;

export interface AppMutationOptions {
  onSuccess?: (value: unknown) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
}

export interface AppMutationController<TArgs> {
  mutate: (args: TArgs, options?: AppMutationOptions) => void;
  mutateAsync: (args: TArgs) => Promise<unknown>;
  isPending: boolean;
  error: Error | null;
}

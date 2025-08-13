// TRPC barrel exports

// Query client factory
export { createQueryClient } from "./query-client";

// React client exports
export {
  api as clientApi,
  TRPCReactProvider,
  type RouterInputs,
  type RouterOutputs,
} from "./react";

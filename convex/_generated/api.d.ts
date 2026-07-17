/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authUsers from "../authUsers.js";
import type * as awardCalculations from "../awardCalculations.js";
import type * as crons from "../crons.js";
import type * as data from "../data.js";
import type * as externalWorker from "../externalWorker.js";
import type * as jobCatalog from "../jobCatalog.js";
import type * as jobRunner from "../jobRunner.js";
import type * as jobs from "../jobs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authUsers: typeof authUsers;
  awardCalculations: typeof awardCalculations;
  crons: typeof crons;
  data: typeof data;
  externalWorker: typeof externalWorker;
  jobCatalog: typeof jobCatalog;
  jobRunner: typeof jobRunner;
  jobs: typeof jobs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

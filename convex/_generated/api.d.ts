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
import type * as conferenceContest from "../conferenceContest.js";
import type * as crons from "../crons.js";
import type * as data from "../data.js";
import type * as draft from "../draft.js";
import type * as externalWorker from "../externalWorker.js";
import type * as frontend from "../frontend.js";
import type * as http from "../http.js";
import type * as jobCatalog from "../jobCatalog.js";
import type * as jobRunner from "../jobRunner.js";
import type * as jobs from "../jobs.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_compatibilityRead from "../lib/compatibilityRead.js";
import type * as lib_contractSigning from "../lib/contractSigning.js";
import type * as lib_contractSigningTransaction from "../lib/contractSigningTransaction.js";
import type * as lib_draftCorrection from "../lib/draftCorrection.js";
import type * as lib_draftMode from "../lib/draftMode.js";
import type * as lib_frontendQuery from "../lib/frontendQuery.js";
import type * as lib_jobLifecycle from "../lib/jobLifecycle.js";
import type * as lib_matchupProjection from "../lib/matchupProjection.js";
import type * as lib_notificationEvents from "../lib/notificationEvents.js";
import type * as lib_notificationValidators from "../lib/notificationValidators.js";
import type * as lib_publicProjection from "../lib/publicProjection.js";
import type * as lib_reporterDirectory from "../lib/reporterDirectory.js";
import type * as lib_scheduleProjection from "../lib/scheduleProjection.js";
import type * as lib_standingsProjection from "../lib/standingsProjection.js";
import type * as lib_teamHistoryProjection from "../lib/teamHistoryProjection.js";
import type * as lib_teamLineup from "../lib/teamLineup.js";
import type * as lib_teamScheduleProjection from "../lib/teamScheduleProjection.js";
import type * as lib_timestamps from "../lib/timestamps.js";
import type * as lib_ufaCatalog from "../lib/ufaCatalog.js";
import type * as lib_ufaReconciliation from "../lib/ufaReconciliation.js";
import type * as lib_weeklyEditionPublication from "../lib/weeklyEditionPublication.js";
import type * as lib_yahooOAuth from "../lib/yahooOAuth.js";
import type * as maintenanceScope from "../maintenanceScope.js";
import type * as matchup from "../matchup.js";
import type * as notificationPush from "../notificationPush.js";
import type * as notificationScanner from "../notificationScanner.js";
import type * as notifications from "../notifications.js";
import type * as playerDayArchive from "../playerDayArchive.js";
import type * as reporterBackfill from "../reporterBackfill.js";
import type * as schedule from "../schedule.js";
import type * as standings from "../standings.js";
import type * as teamHistory from "../teamHistory.js";
import type * as timestampMigration from "../timestampMigration.js";
import type * as tradeBlock from "../tradeBlock.js";
import type * as ufa from "../ufa.js";
import type * as ufaOdds from "../ufaOdds.js";
import type * as weeklyEditionBackfill from "../weeklyEditionBackfill.js";
import type * as weeklyEditions from "../weeklyEditions.js";
import type * as yahoo from "../yahoo.js";
import type * as yahooBackfill from "../yahooBackfill.js";
import type * as yahooConnectionStore from "../yahooConnectionStore.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authUsers: typeof authUsers;
  awardCalculations: typeof awardCalculations;
  conferenceContest: typeof conferenceContest;
  crons: typeof crons;
  data: typeof data;
  draft: typeof draft;
  externalWorker: typeof externalWorker;
  frontend: typeof frontend;
  http: typeof http;
  jobCatalog: typeof jobCatalog;
  jobRunner: typeof jobRunner;
  jobs: typeof jobs;
  "lib/auth": typeof lib_auth;
  "lib/compatibilityRead": typeof lib_compatibilityRead;
  "lib/contractSigning": typeof lib_contractSigning;
  "lib/contractSigningTransaction": typeof lib_contractSigningTransaction;
  "lib/draftCorrection": typeof lib_draftCorrection;
  "lib/draftMode": typeof lib_draftMode;
  "lib/frontendQuery": typeof lib_frontendQuery;
  "lib/jobLifecycle": typeof lib_jobLifecycle;
  "lib/matchupProjection": typeof lib_matchupProjection;
  "lib/notificationEvents": typeof lib_notificationEvents;
  "lib/notificationValidators": typeof lib_notificationValidators;
  "lib/publicProjection": typeof lib_publicProjection;
  "lib/reporterDirectory": typeof lib_reporterDirectory;
  "lib/scheduleProjection": typeof lib_scheduleProjection;
  "lib/standingsProjection": typeof lib_standingsProjection;
  "lib/teamHistoryProjection": typeof lib_teamHistoryProjection;
  "lib/teamLineup": typeof lib_teamLineup;
  "lib/teamScheduleProjection": typeof lib_teamScheduleProjection;
  "lib/timestamps": typeof lib_timestamps;
  "lib/ufaCatalog": typeof lib_ufaCatalog;
  "lib/ufaReconciliation": typeof lib_ufaReconciliation;
  "lib/weeklyEditionPublication": typeof lib_weeklyEditionPublication;
  "lib/yahooOAuth": typeof lib_yahooOAuth;
  maintenanceScope: typeof maintenanceScope;
  matchup: typeof matchup;
  notificationPush: typeof notificationPush;
  notificationScanner: typeof notificationScanner;
  notifications: typeof notifications;
  playerDayArchive: typeof playerDayArchive;
  reporterBackfill: typeof reporterBackfill;
  schedule: typeof schedule;
  standings: typeof standings;
  teamHistory: typeof teamHistory;
  timestampMigration: typeof timestampMigration;
  tradeBlock: typeof tradeBlock;
  ufa: typeof ufa;
  ufaOdds: typeof ufaOdds;
  weeklyEditionBackfill: typeof weeklyEditionBackfill;
  weeklyEditions: typeof weeklyEditions;
  yahoo: typeof yahoo;
  yahooBackfill: typeof yahooBackfill;
  yahooConnectionStore: typeof yahooConnectionStore;
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

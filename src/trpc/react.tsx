"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { loggerLink, unstable_httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { useEffect, useState } from "react";
import SuperJSON from "superjson";
import { createQueryClient } from "./query-client";
import { type AppRouter } from "@gshl-api";
import { markAsFetched, shouldRefetch } from "@gshl-cache";
import type {
  Conference,
  Contract,
  DraftPick,
  Franchise,
  GSHLTeam,
  MatchupMetadata,
  NHLTeam,
  Owner,
  Player,
  Season,
  Team,
  Week,
} from "@gshl-types";
import {
  initQueryClientPersistence,
  restorePersistedQueryClientSync,
} from "./query-persistence";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const REFERENCE_DATA_MODELS = [
  "Season",
  "Week",
  "Team",
  "Franchise",
  "Conference",
  "Owner",
  "Player",
  "Contract",
  "DraftPick",
  "NHLTeam",
] as const;
const SEASON_ORDER = { year: "asc" as const };
const WEEK_ORDER = { startDate: "asc" as const };
const MATCHUP_ORDER = { seasonId: "asc" as const };
const REFERENCE_DATA_CACHE_KEY = "referenceDataBundle";
const MATCHUP_METADATA_CACHE_KEY = "matchupMetadata";

const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  }

  // Browser: use singleton pattern with persistence
  if (!clientQueryClientSingleton) {
    clientQueryClientSingleton = createQueryClient();
    restorePersistedQueryClientSync(clientQueryClientSingleton);
  }

  return clientQueryClientSingleton;
};

export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

function normalizeIdString(
  value: string | number | null | undefined,
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return undefined;
}

function enrichTeamsWithRelations(
  teams: Team[],
  franchises: Franchise[],
  owners: Owner[],
  conferences: Conference[],
): GSHLTeam[] {
  const franchiseMap = new Map(
    franchises.map((franchise) => [String(franchise.id), franchise]),
  );
  const ownerMap = new Map(owners.map((owner) => [String(owner.id), owner]));
  const conferenceMap = new Map(
    conferences.map((conference) => [String(conference.id), conference]),
  );

  return teams.map((team): GSHLTeam => {
    const franchise = franchiseMap.get(String(team.franchiseId));
    const owner = franchise
      ? ownerMap.get(String(franchise.ownerId))
      : undefined;
    const resolvedConfId =
      normalizeIdString(team.confId) ??
      normalizeIdString(franchise?.confId) ??
      null;
    const conference = resolvedConfId
      ? conferenceMap.get(resolvedConfId)
      : undefined;

    return {
      id: team.id,
      seasonId: team.seasonId,
      franchiseId: team.franchiseId,
      name: franchise?.name ?? null,
      abbr: franchise?.abbr ?? null,
      logoUrl: franchise?.logoUrl ?? null,
      isActive: franchise?.isActive ?? false,
      yahooId: team.yahooId ?? null,
      confId: resolvedConfId,
      confName: conference?.name ?? null,
      confAbbr: conference?.abbr ?? null,
      confLogoUrl: conference?.logoUrl ?? null,
      ownerId: owner?.id ?? null,
      ownerFirstName: owner?.firstName ?? null,
      ownerLastName: owner?.lastName ?? null,
      ownerNickname: owner?.nickName ?? null,
      ownerEmail: owner?.email ?? null,
      ownerOwing: owner?.owing ?? null,
      ownerIsActive: owner?.isActive ?? false,
    };
  });
}

function seedReferenceDataCache(
  utils: ReturnType<typeof api.useUtils>,
  snapshot: Record<string, unknown[]>,
) {
  const seasons = ((snapshot.Season ?? []) as Season[]).slice().sort((a, b) => {
    return a.year - b.year;
  });
  const weeks = ((snapshot.Week ?? []) as Week[]).slice().sort((a, b) => {
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });
  const franchises = (snapshot.Franchise ?? []) as Franchise[];
  const owners = (snapshot.Owner ?? []) as Owner[];
  const conferences = (snapshot.Conference ?? []) as Conference[];
  const players = (snapshot.Player ?? []) as Player[];
  const contracts = (snapshot.Contract ?? []) as Contract[];
  const draftPicks = (snapshot.DraftPick ?? []) as DraftPick[];
  const teams = enrichTeamsWithRelations(
    (snapshot.Team ?? []) as Team[],
    franchises,
    owners,
    conferences,
  );
  const nhlTeams = (snapshot.NHLTeam ?? []) as NHLTeam[];

  utils.season.getAll.setData({ orderBy: SEASON_ORDER }, seasons);
  utils.season.getActive.setData(
    undefined,
    seasons.find((season) => season.isActive) ?? null,
  );

  for (const season of seasons) {
    utils.season.getById.setData({ id: String(season.id) }, season);
  }

  utils.week.getAll.setData({ orderBy: WEEK_ORDER }, weeks);
  utils.week.getActive.setData(
    undefined,
    weeks.find((week) => week.isActive) ?? null,
  );

  const weeksBySeason = new Map<string, Week[]>();
  for (const week of weeks) {
    const seasonWeeks = weeksBySeason.get(String(week.seasonId)) ?? [];
    seasonWeeks.push(week);
    weeksBySeason.set(String(week.seasonId), seasonWeeks);
    utils.week.getById.setData({ id: String(week.id) }, week);
  }

  for (const [seasonId, seasonWeeks] of weeksBySeason) {
    utils.week.getAll.setData(
      { where: { seasonId }, orderBy: WEEK_ORDER },
      seasonWeeks,
    );
  }

  utils.franchise.getAll.setData({}, franchises);
  for (const franchise of franchises) {
    utils.franchise.getById.setData({ id: String(franchise.id) }, franchise);
  }

  utils.owner.getAll.setData({}, owners);
  for (const owner of owners) {
    utils.owner.getById.setData({ id: String(owner.id) }, owner);
  }

  utils.conference.getAll.setData({}, conferences);
  for (const conference of conferences) {
    utils.conference.getById.setData({ id: String(conference.id) }, conference);
  }

  utils.team.getAll.setData({ where: undefined, orderBy: undefined }, teams);
  utils.team.getNHLTeams.setData(undefined, nhlTeams);

  const teamsBySeason = new Map<string, GSHLTeam[]>();
  for (const team of teams) {
    const seasonTeams = teamsBySeason.get(String(team.seasonId)) ?? [];
    seasonTeams.push(team);
    teamsBySeason.set(String(team.seasonId), seasonTeams);
    utils.team.getById.setData({ id: String(team.id) }, team);
  }

  for (const [seasonId, seasonTeams] of teamsBySeason) {
    utils.team.getAll.setData(
      { where: { seasonId }, orderBy: undefined },
      seasonTeams,
    );
  }

  utils.player.getAll.setData({}, players);
  utils.player.getAll.setData(
    { where: { isActive: true } },
    players.filter((player) => player.isActive),
  );

  utils.contract.getAll.setData({}, contracts);
  utils.draftPick.getAll.setData({}, draftPicks);
}

function seedMatchupMetadataCache(
  utils: ReturnType<typeof api.useUtils>,
  matchups: MatchupMetadata[],
) {
  utils.matchup.getMetadata.setData({ orderBy: MATCHUP_ORDER }, matchups);

  const matchupsBySeason = new Map<string, MatchupMetadata[]>();
  const matchupsByWeek = new Map<string, MatchupMetadata[]>();

  for (const matchup of matchups) {
    utils.matchup.getMetadata.setData(
      { where: { id: String(matchup.id) }, orderBy: MATCHUP_ORDER },
      [matchup],
    );

    const seasonKey = String(matchup.seasonId);
    const seasonMatchups = matchupsBySeason.get(seasonKey) ?? [];
    seasonMatchups.push(matchup);
    matchupsBySeason.set(seasonKey, seasonMatchups);

    const weekKey = `${matchup.seasonId}:${matchup.weekId}`;
    const weekMatchups = matchupsByWeek.get(weekKey) ?? [];
    weekMatchups.push(matchup);
    matchupsByWeek.set(weekKey, weekMatchups);
  }

  for (const [seasonId, seasonMatchups] of matchupsBySeason) {
    utils.matchup.getMetadata.setData(
      { where: { seasonId }, orderBy: MATCHUP_ORDER },
      seasonMatchups,
    );
  }

  for (const [key, weekMatchups] of matchupsByWeek) {
    const [seasonId, weekId] = key.split(":");
    utils.matchup.getMetadata.setData(
      { where: { seasonId, weekId }, orderBy: MATCHUP_ORDER },
      weekMatchups,
    );
  }
}

function hasReferenceDataCache(utils: ReturnType<typeof api.useUtils>) {
  return Boolean(
    utils.season.getAll.getData({ orderBy: SEASON_ORDER })?.length &&
      utils.player.getAll.getData({})?.length &&
      utils.contract.getAll.getData({})?.length,
  );
}

function hasMatchupMetadataCache(utils: ReturnType<typeof api.useUtils>) {
  return Boolean(utils.matchup.getMetadata.getData({ orderBy: MATCHUP_ORDER }));
}

function ReferenceDataBootstrap() {
  const utils = api.useUtils();

  useEffect(() => {
    let isCancelled = false;

    const warmReferenceData = async () => {
      const shouldRefreshReferenceData =
        shouldRefetch(REFERENCE_DATA_CACHE_KEY) ||
        !hasReferenceDataCache(utils);
      const shouldRefreshMatchupMetadata =
        shouldRefetch(MATCHUP_METADATA_CACHE_KEY) ||
        !hasMatchupMetadataCache(utils);

      if (!shouldRefreshReferenceData && !shouldRefreshMatchupMetadata) {
        return;
      }

      try {
        const [snapshot, matchupMetadata] = await Promise.all([
          shouldRefreshReferenceData
            ? utils.snapshot.get.fetch({ models: [...REFERENCE_DATA_MODELS] })
            : Promise.resolve(null),
          shouldRefreshMatchupMetadata
            ? utils.matchup.getMetadata.fetch({ orderBy: MATCHUP_ORDER })
            : Promise.resolve(null),
        ]);

        if (isCancelled) {
          return;
        }

        if (snapshot) {
          seedReferenceDataCache(utils, snapshot);
          markAsFetched(REFERENCE_DATA_CACHE_KEY);
        }

        if (matchupMetadata) {
          seedMatchupMetadataCache(utils, matchupMetadata);
          markAsFetched(MATCHUP_METADATA_CACHE_KEY);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Failed to warm reference data snapshot", error);
        }
      }
    };

    void warmReferenceData();

    return () => {
      isCancelled = true;
    };
  }, [utils]);

  return null;
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [isPersistenceReady, setIsPersistenceReady] = useState(
    typeof window === "undefined",
  );

  useEffect(() => {
    let isMounted = true;
    const { unsubscribe, restorePromise } =
      initQueryClientPersistence(queryClient);

    void restorePromise.finally(() => {
      if (isMounted) {
        setIsPersistenceReady(true);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [queryClient]);

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        unstable_httpBatchStreamLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          headers: () => {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {isPersistenceReady ? <ReferenceDataBootstrap /> : null}
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

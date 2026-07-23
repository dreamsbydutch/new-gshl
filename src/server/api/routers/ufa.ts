import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  type Contract,
  type Franchise,
  type NHLTeam,
  type Player,
  type PlayerNHLStatLine,
  type Season,
  type Team,
  SALARY_CAP,
} from "@gshl-types";
import {
  checkContractCapSpace,
  findNhlTeamByAbbreviation,
  getContractCoveredSeasonIds,
  getTorontoDate,
  indexLatestUfaNhlStats,
  isUnsignedForSigningSeason,
  rankUfas,
  selectTopAffordableUfas,
} from "@gshl-utils";
import { callConvex } from "@gshl-lib/data/convex-store";
import {
  commissionerProcedure,
  createTRPCRouter,
  ownerOrCommissionerProcedure,
  publicProcedure,
} from "../trpc";
import { getFirst, getMany } from "../sheets-store";

type OperationalState = {
  groups: Array<{
    id: string;
    playerId: string;
    seasonId: string;
    deadlineAt: number;
    status: "open" | "resolving" | "resolved" | "failed";
    winningOfferId?: string;
    finalOdds?: string;
    randomRoll?: number;
    failureReason?: string;
  }>;
  offers: Array<{
    id: string;
    groupId: string;
    playerId: string;
    seasonId: string;
    ownerId: string;
    franchiseId: string;
    teamId: string;
    contractLength: number;
    salary: number;
    status: "pending" | "won" | "lost";
    submittedAt: number;
  }>;
  oddsByGroup: Record<string, Array<{ offerId: string; probability: number }>>;
};

const HOME_UFA_LIMIT = 15;

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function getWindow(season: Season | null) {
  const afterSigning = Boolean(
    season?.signingEndDate && getTorontoDate() > season.signingEndDate,
  );
  return {
    isOpen: afterSigning,
    signingEndDate: season?.signingEndDate ?? null,
    reason: !season
      ? "There is no active signing season."
      : !afterSigning
        ? "Summer Free Agency opens after the signing deadline."
        : null,
  };
}

async function getLatestPopulatedNhlStats(
  seasons: Season[],
  signingSeason: Season | null,
): Promise<PlayerNHLStatLine[]> {
  const maximumYear = numberValue(
    signingSeason?.year,
    Number.POSITIVE_INFINITY,
  );
  const candidates = [...seasons]
    .filter((season) => numberValue(season.year) <= maximumYear)
    .sort((left, right) => numberValue(right.year) - numberValue(left.year));

  for (const season of candidates) {
    const stats = await getMany<PlayerNHLStatLine>("PlayerNHLStatLine", {
      where: { seasonId: String(season.id) },
    });
    if (stats.length > 0) return stats;
  }

  return [];
}

function capEligibility(options: {
  ownerId: string | undefined;
  salary: number;
  length: number;
  signingSeason: Season | null;
  seasons: Season[];
  contracts: Contract[];
  state: OperationalState;
}) {
  const { ownerId, salary, length, signingSeason, seasons, contracts, state } =
    options;
  if (!ownerId || !signingSeason) return false;
  const ordered = [...seasons].sort((a, b) => a.year - b.year);
  const reservedCapBySeasonId = new Map<string, number>();

  state.offers
    .filter(
      (offer) =>
        String(offer.ownerId) === String(ownerId) && offer.status === "pending",
    )
    .forEach((offer) => {
      getContractCoveredSeasonIds(
        {
          seasonId: offer.seasonId,
          contractLength: offer.contractLength,
        },
        ordered,
      ).forEach((seasonId) => {
        reservedCapBySeasonId.set(
          seasonId,
          (reservedCapBySeasonId.get(seasonId) ?? 0) + offer.salary,
        );
      });
    });

  return checkContractCapSpace({
    ownerId,
    signingSeasonId: String(signingSeason.id),
    contractLength: length as 1 | 2 | 3,
    contractSalary: salary,
    contracts,
    seasons: ordered,
    salaryCap: SALARY_CAP,
    reservedCapBySeasonId,
  }).affordable;
}

export const ufaRouter = createTRPCRouter({
  getLiveState: publicProcedure.query(async () => {
    const [signingSeason, state] = await Promise.all([
      getFirst<Season>("Season", { where: { isActive: true } }),
      callConvex<OperationalState>("query", "ufa:listState", {}),
    ]);

    return {
      window: getWindow(signingSeason),
      groups: state.groups
        .filter((group) => group.status === "open")
        .sort((left, right) => left.deadlineAt - right.deadlineAt)
        .map((group) => {
          const odds = state.oddsByGroup[group.id] ?? [];
          return {
            id: group.id,
            playerId: group.playerId,
            deadlineAt: group.deadlineAt,
            offers: state.offers
              .filter(
                (offer) =>
                  offer.groupId === group.id && offer.status === "pending",
              )
              .map((offer) => ({
                id: offer.id,
                franchiseId: offer.franchiseId,
                years: offer.contractLength,
                salary: offer.salary,
                probability:
                  odds.find((entry) => entry.offerId === offer.id)
                    ?.probability ?? 0,
              })),
          };
        }),
    };
  }),

  getOverview: publicProcedure.query(async ({ ctx }) => {
    const [signingSeason, seasons, franchises, state] = await Promise.all([
      getFirst<Season>("Season", { where: { isActive: true } }),
      getMany<Season>("Season", { orderBy: { year: "asc" } }),
      getMany<Franchise>("Franchise"),
      callConvex<OperationalState>("query", "ufa:listState", {}),
    ]);
    const ownerId = ctx.session?.user?.ownerId;
    const [players, nhlTeams, nhlStats, teams, contracts] = await Promise.all([
      getMany<Player>("Player", {
        where: {
          isActive: true,
        },
      }),
      getMany<NHLTeam>("NHLTeam"),
      getLatestPopulatedNhlStats(seasons, signingSeason),
      signingSeason
        ? getMany<Team>("Team", {
            where: { seasonId: String(signingSeason.id) },
          })
        : Promise.resolve([]),
      getMany<Contract>("Contract"),
    ]);
    const window = getWindow(signingSeason);
    const statByPlayer = indexLatestUfaNhlStats(
      nhlStats,
      seasons,
      signingSeason?.year,
    );
    const ownerFranchise = franchises.find(
      (franchise) =>
        String(franchise.ownerId) === String(ownerId ?? "") &&
        franchise.isActive,
    );
    const ownerTeam = teams.find(
      (team) =>
        String(team.franchiseId) === String(ownerFranchise?.id ?? "") &&
        String(team.seasonId) === String(signingSeason?.id ?? ""),
    );
    const freeAgents = rankUfas(
      players
        .filter(
          (player) =>
            player.isActive &&
            Boolean(signingSeason) &&
            isUnsignedForSigningSeason(
              String(player.id),
              String(signingSeason?.id ?? ""),
              contracts,
              seasons,
            ) &&
            numberValue(player.salary) > 0,
        )
        .map((player) => {
          const stats = statByPlayer.get(String(player.id));
          const salary = Math.round(numberValue(player.salary) * 1.25);
          const group = state.groups.find(
            (candidate) =>
              candidate.playerId === String(player.id) &&
              candidate.status === "open",
          );
          const existingOffer = state.offers.find(
            (offer) =>
              offer.groupId === group?.id &&
              offer.ownerId === String(ownerId ?? ""),
          );
          const affordableTerms = ([1, 2, 3] as const).filter((length) =>
            capEligibility({
              ownerId,
              salary,
              length,
              signingSeason,
              seasons,
              contracts,
              state,
            }),
          );
          const nhlTeam = findNhlTeamByAbbreviation(nhlTeams, player.nhlTeam);
          return {
            id: String(player.id),
            fullName: player.fullName,
            nhlTeam: player.nhlTeam,
            nhlTeamLogoUrl: nhlTeam?.logoUrl ?? null,
            positions: Array.isArray(player.nhlPos)
              ? player.nhlPos.map(String)
              : [],
            positionGroup: String(player.posGroup),
            salary,
            seasonRating: numberValue(
              stats?.seasonRating,
              numberValue(player.seasonRating),
            ),
            overallRating: numberValue(
              stats?.overallRating,
              numberValue(player.overallRating),
            ),
            stats: stats
              ? {
                  GP: stats.GP,
                  G: stats.G,
                  A: stats.A,
                  P: stats.P,
                  PM: stats.PM,
                  PIM: stats.PIM,
                  PPP: stats.PPP,
                  SOG: stats.SOG,
                  HIT: stats.HIT,
                  BLK: stats.BLK,
                  W: stats.W,
                  GA: stats.GA,
                  GAA: stats.GAA,
                  SV: stats.SV,
                  SA: stats.SA,
                  SVP: stats.SVP,
                  SO: stats.SO,
                  QS: stats.QS,
                  RBS: stats.RBS,
                }
              : null,
            affordableTerms,
            existingOffer: existingOffer
              ? {
                  years: existingOffer.contractLength,
                  status: existingOffer.status,
                }
              : null,
            canOffer:
              window.isOpen &&
              (ctx.session?.user?.role === "owner" ||
                ctx.session?.user?.role === "commissioner") &&
              Boolean(ownerFranchise && ownerTeam) &&
              !existingOffer &&
              affordableTerms.length > 0,
            disabledReason: !window.isOpen
              ? window.reason
              : !ctx.session?.user
                ? "Sign in as a franchise owner to make an offer."
                : ctx.session.user.role !== "owner" &&
                    ctx.session.user.role !== "commissioner"
                  ? "Only franchise owners can make UFA offers."
                  : !ownerFranchise || !ownerTeam
                    ? "Your account is not linked to an active franchise."
                    : existingOffer
                      ? "Your franchise already made a binding offer."
                      : affordableTerms.length === 0
                        ? "Your franchise does not have enough available cap space."
                        : null,
          };
        }),
    );
    const offerGroups = state.groups
      .filter((group) => group.status === "open")
      .sort((a, b) => a.deadlineAt - b.deadlineAt)
      .map((group) => {
        const player = freeAgents.find(
          (candidate) => candidate.id === group.playerId,
        );
        const odds = state.oddsByGroup[group.id] ?? [];
        return {
          id: group.id,
          deadlineAt: group.deadlineAt,
          player,
          offers: state.offers
            .filter(
              (offer) =>
                offer.groupId === group.id && offer.status === "pending",
            )
            .map((offer) => {
              const franchise = franchises.find(
                (candidate) => String(candidate.id) === offer.franchiseId,
              );
              return {
                id: offer.id,
                franchiseName: franchise?.name ?? "Unknown franchise",
                franchiseLogoUrl: franchise?.logoUrl ?? null,
                years: offer.contractLength,
                salary: offer.salary,
                probability:
                  odds.find((entry) => entry.offerId === offer.id)
                    ?.probability ?? 0,
              };
            }),
        };
      });
    const isSignedInOwner = ctx.session?.user?.role === "owner";
    const topFreeAgents = isSignedInOwner
      ? selectTopAffordableUfas(freeAgents, HOME_UFA_LIMIT)
      : freeAgents.slice(0, HOME_UFA_LIMIT);
    return {
      window,
      freeAgents,
      topFreeAgents,
      offerGroups,
      viewer: {
        isSignedInOwner,
      },
      franchises: franchises.map((franchise) => ({
        id: String(franchise.id),
        name: franchise.name,
        logoUrl: franchise.logoUrl ?? null,
      })),
    };
  }),

  submitOffer: ownerOrCommissionerProcedure
    .input(
      z.object({
        playerId: z.string().min(1),
        contractLength: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ownerId = ctx.session!.user.ownerId;
      if (!ownerId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your account is not linked to a franchise owner.",
        });
      }
      try {
        return await callConvex("mutation", "ufa:submitOffer", {
          ownerId,
          playerId: input.playerId,
          contractLength: input.contractLength,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to submit the UFA offer.",
        });
      }
    }),

  reconcile: commissionerProcedure.mutation(() =>
    callConvex("mutation", "ufa:reconcile", {}),
  ),
});

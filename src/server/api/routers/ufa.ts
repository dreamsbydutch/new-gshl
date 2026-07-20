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
  ResignableStatus,
  SALARY_CAP,
} from "@gshl-types";
import {
  findNhlTeamByAbbreviation,
  getContractCoveredSeasonIds,
  getTorontoDate,
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

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function getWindow(season: Season | null) {
  const draftStartAt = season?.draftStartAt
    ? Date.parse(season.draftStartAt)
    : Number.NaN;
  const now = Date.now();
  const afterSigning = Boolean(
    season?.signingEndDate && getTorontoDate() > season.signingEndDate,
  );
  const configured = Number.isFinite(draftStartAt);
  return {
    isOpen: afterSigning && configured && now < draftStartAt,
    signingEndDate: season?.signingEndDate ?? null,
    draftStartAt: configured ? new Date(draftStartAt).toISOString() : null,
    reason: !season
      ? "There is no active signing season."
      : !afterSigning
        ? "Summer Free Agency opens after the signing deadline."
        : !configured
          ? "The draft start time has not been configured."
          : now >= draftStartAt
            ? "Summer Free Agency closed when the draft began."
            : null,
  };
}

function latestNhlStats(
  stats: PlayerNHLStatLine[],
  seasons: Season[],
  signingSeason: Season | null,
) {
  const seasonById = new Map(
    seasons.map((season) => [String(season.id), season]),
  );
  const eligible = stats.filter(
    (row) =>
      (seasonById.get(String(row.seasonId))?.year ??
        Number.POSITIVE_INFINITY) <=
      (signingSeason?.year ?? Number.POSITIVE_INFINITY),
  );
  const latestYear = Math.max(
    Number.NEGATIVE_INFINITY,
    ...eligible.map(
      (row) =>
        seasonById.get(String(row.seasonId))?.year ?? Number.NEGATIVE_INFINITY,
    ),
  );
  return new Map(
    eligible
      .filter(
        (row) => seasonById.get(String(row.seasonId))?.year === latestYear,
      )
      .map((row) => [String(row.playerId), row]),
  );
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
  const signingIndex = ordered.findIndex(
    (season) => String(season.id) === String(signingSeason.id),
  );
  const covered = ordered.slice(signingIndex + 1, signingIndex + 1 + length);
  if (covered.length !== length) return false;
  return covered.every((season) => {
    const committed = contracts
      .filter(
        (contract) =>
          String(contract.ownerId) === ownerId &&
          getContractCoveredSeasonIds(contract, ordered).includes(
            String(season.id),
          ),
      )
      .reduce(
        (sum, contract) =>
          sum +
          numberValue(contract.capHit, numberValue(contract.contractSalary)),
        0,
      );
    const reserved = state.offers
      .filter(
        (offer) => offer.ownerId === ownerId && offer.status === "pending",
      )
      .filter((offer) => {
        const index = ordered.findIndex(
          (candidate) => String(candidate.id) === String(offer.seasonId),
        );
        return ordered
          .slice(index + 1, index + 1 + offer.contractLength)
          .some((candidate) => String(candidate.id) === String(season.id));
      })
      .reduce((sum, offer) => sum + offer.salary, 0);
    return committed + reserved + salary <= SALARY_CAP;
  });
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
    const statsSeason = [...seasons]
      .filter(
        (season) =>
          season.year <= (signingSeason?.year ?? Number.POSITIVE_INFINITY),
      )
      .sort((left, right) => right.year - left.year)[0];
    const ownerId = ctx.session?.user?.ownerId;
    const [players, nhlTeams, nhlStats, teams, contracts] = await Promise.all([
      getMany<Player>("Player", {
        where: {
          isActive: true,
          isSignable: true,
          isResignable: String(ResignableStatus.UFA),
        },
      }),
      getMany<NHLTeam>("NHLTeam"),
      statsSeason
        ? getMany<PlayerNHLStatLine>("PlayerNHLStatLine", {
            where: { seasonId: String(statsSeason.id) },
          })
        : Promise.resolve([]),
      signingSeason
        ? getMany<Team>("Team", {
            where: { seasonId: String(signingSeason.id) },
          })
        : Promise.resolve([]),
      ownerId
        ? getMany<Contract>("Contract", { where: { ownerId } })
        : Promise.resolve([]),
    ]);
    const window = getWindow(signingSeason);
    const statByPlayer = latestNhlStats(nhlStats, seasons, signingSeason);
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
    const freeAgents = players
      .filter(
        (player) =>
          player.isActive &&
          player.isSignable &&
          String(player.isResignable).toUpperCase() ===
            String(ResignableStatus.UFA),
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
      })
      .sort(
        (left, right) =>
          right.overallRating - left.overallRating ||
          right.seasonRating - left.seasonRating ||
          left.fullName.localeCompare(right.fullName),
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
    return {
      window,
      freeAgents,
      topFreeAgents: freeAgents.slice(0, 10),
      offerGroups,
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

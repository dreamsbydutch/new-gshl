import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  commissionerProcedure,
  createTRPCRouter,
  publicProcedure,
} from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import {
  ResignableStatus,
  SALARY_CAP,
  type Contract,
  type Franchise,
  type Owner,
  type Player,
  type Season,
  type Team,
} from "@gshl-types";
import {
  checkContractCapSpace,
  deriveContractCreationTerms,
  getTorontoDate,
  isUnsignedForSigningSeason,
  isUfaFreeAgencyOpen,
  type ContractCreationTerms,
} from "@gshl-utils";
import { minimalSheetsWriter } from "@gshl-sheets";
import { getById, getCount, getFirst, getMany } from "../sheets-store";

// Contract router
const contractWhereSchema = z
  .object({
    playerId: z.string().optional(),
    ownerId: z.string().optional(),
    teamId: z.string().optional(),
    seasonId: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

const contractLengthSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

function reject(
  message: string,
  code: "BAD_REQUEST" | "CONFLICT" = "BAD_REQUEST",
): never {
  throw new TRPCError({ code, message });
}

export const contractRouter = createTRPCRouter({
  create: commissionerProcedure
    .input(
      z.object({
        teamId: z.string().min(1),
        playerId: z.string().min(1),
        contractLength: contractLengthSchema,
      }),
    )
    .mutation(async ({ input }): Promise<Contract> => {
      const [team, player, signingSeason, seasons, allContracts] =
        await Promise.all([
          getById<Team>("Team", input.teamId),
          getById<Player>("Player", input.playerId),
          getFirst<Season>("Season", { where: { isActive: true } }),
          getMany<Season>("Season"),
          getMany<Contract>("Contract"),
        ]);

      const playerContracts = allContracts.filter(
        (contract) => String(contract.playerId) === String(input.playerId),
      );

      if (!team) reject("The selected team could not be found.");
      if (!player) reject("The selected player could not be found.");
      if (!signingSeason) reject("There is no active signing season.");
      if (String(team.seasonId) !== String(signingSeason.id)) {
        reject("The selected team is not from the active signing season.");
      }

      const franchise = await getById<Franchise>(
        "Franchise",
        String(team.franchiseId),
      );

      if (!franchise?.isActive || !franchise.ownerId) {
        reject("The selected team does not have an active franchise owner.");
      }
      const resolvedOwner = await getById<Owner>(
        "Owner",
        String(franchise.ownerId),
      );
      if (!resolvedOwner?.isActive) {
        reject("The selected team does not have an active league owner.");
      }
      const belongsToTeam =
        String(player.gshlTeamId) === String(team.franchiseId);
      const summerFreeAgencyOpen = isUfaFreeAgencyOpen(signingSeason);
      const isUnsignedSummerUfa =
        summerFreeAgencyOpen &&
        isUnsignedForSigningSeason(
          String(player.id),
          String(signingSeason.id),
          playerContracts,
          seasons,
        );
      const isCrossTeamUfa = !belongsToTeam && isUnsignedSummerUfa;

      const duplicate = playerContracts.find(
        (contract) => String(contract.seasonId) === String(signingSeason.id),
      );
      if (duplicate) {
        const isSameRequest =
          String(duplicate.ownerId) === String(resolvedOwner.id) &&
          Number(duplicate.contractLength) === input.contractLength;
        if (!isSameRequest) {
          reject(
            "This player already has a contract for the active signing season.",
            "CONFLICT",
          );
        }

        await minimalSheetsWriter.updateById("Player", player.id, {
          gshlTeamId: team.franchiseId,
          isSignable: false,
          isResignable: null,
          ...(!belongsToTeam ? { lineupPos: null } : {}),
        });
        return duplicate;
      }

      if (!player.isActive || (!player.isSignable && !isUnsignedSummerUfa)) {
        reject("The selected player is no longer signable.", "CONFLICT");
      }
      if (!belongsToTeam && !isCrossTeamUfa) {
        reject(
          "A player from another team can only be signed when UFA free agency is open.",
        );
      }

      let terms: ContractCreationTerms;
      try {
        terms = deriveContractCreationTerms({
          player: isUnsignedSummerUfa
            ? { ...player, isResignable: ResignableStatus.UFA }
            : player,
          signingSeason,
          contractLength: input.contractLength,
          contracts: playerContracts,
          seasons,
        });
      } catch (error) {
        reject(
          error instanceof Error
            ? error.message
            : "Contract terms are invalid.",
        );
      }

      const capCheck = checkContractCapSpace({
        ownerId: String(resolvedOwner.id),
        signingSeasonId: String(signingSeason.id),
        contractLength: input.contractLength,
        contractSalary: terms.contractSalary,
        contracts: allContracts,
        seasons,
      });
      if (!capCheck.affordable) {
        const limitingSeason = seasons.find(
          (season) => String(season.id) === capCheck.limitingSeasonId,
        );
        reject(
          `This contract requires ${terms.contractSalary.toLocaleString(
            "en-CA",
            {
              style: "currency",
              currency: "CAD",
              maximumFractionDigits: 0,
            },
          )}, but the team only has ${Math.max(
            0,
            capCheck.availableCapSpace,
          ).toLocaleString("en-CA", {
            style: "currency",
            currency: "CAD",
            maximumFractionDigits: 0,
          })} available${limitingSeason ? ` in ${limitingSeason.name}` : ""}. The ${SALARY_CAP.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })} salary cap cannot be exceeded.`,
          "CONFLICT",
        );
      }

      const now = new Date().toISOString();
      const payload = {
        playerId: player.id,
        ownerId: resolvedOwner.id,
        seasonId: signingSeason.id,
        contractType: terms.contractType,
        contractLength: input.contractLength,
        contractSalary: terms.contractSalary,
        signingDate: getTorontoDate(),
        startDate: terms.startDate,
        signingStatus: terms.signingStatus,
        expiryStatus: terms.expiryStatus,
        expiryDate: terms.expiryDate,
        capHit: terms.contractSalary,
        capHitEndDate: terms.expiryDate,
        createdAt: now,
        updatedAt: now,
      };

      await minimalSheetsWriter.upsertByCompositeKey(
        "Contract",
        ["playerId", "ownerId", "seasonId"],
        [payload],
        {
          idColumn: "id",
          createdAtColumn: "createdAt",
          updatedAtColumn: "updatedAt",
        },
      );

      await minimalSheetsWriter.updateById("Player", player.id, {
        gshlTeamId: team.franchiseId,
        isSignable: false,
        isResignable: null,
        ...(isCrossTeamUfa ? { lineupPos: null } : {}),
      });

      const created = (
        await getMany<Contract>("Contract", {
          where: {
            playerId: player.id,
            ownerId: resolvedOwner.id,
            seasonId: signingSeason.id,
          },
        })
      )[0];
      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The contract was written but could not be reloaded.",
        });
      }
      return created;
    }),

  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: contractWhereSchema }))
    .query(async ({ input }): Promise<Contract[]> => {
      return getMany<Contract>("Contract", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Contract | null> => {
      return getById<Contract>("Contract", input.id);
    }),

  getByPlayer: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .query(async ({ input }): Promise<Contract[]> => {
      return getMany<Contract>("Contract", {
        where: { playerId: input.playerId },
      });
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input }): Promise<Contract[]> => {
      return getMany<Contract>("Contract", { where: { teamId: input.teamId } });
    }),

  count: publicProcedure
    .input(z.object({ where: contractWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Contract", input) };
    }),
});

import { z } from "zod";
import type { InjuryReport, PlayerInjury } from "@gshl-lib/types/injuries";
import { getPlayerNhlAbbreviations } from "../domain/player";

export const INJURY_REFRESH_MS = 30 * 60 * 1000;

const espnReport = z.object({
  status: z.literal("success"),
  timestamp: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  injuries: z.array(
    z.object({
      injuries: z.array(
        z.object({
          id: z.string().min(1),
          status: z.string().min(1),
          date: z.string().nullish(),
          shortComment: z.string().nullish(),
          longComment: z.string().nullish(),
          athlete: z.object({
            displayName: z.string().min(1),
            team: z.object({ abbreviation: z.string().min(1) }),
          }),
          details: z
            .object({
              type: z.string().nullish(),
              returnDate: z.string().nullish(),
            })
            .nullish(),
        }),
      ),
    }),
  ),
});

export function injuryDesignation(status: string): string {
  const values: Record<string, string> = {
    "day-to-day": "DTD",
    out: "O",
    "injured reserve": "IR",
    "long-term injured reserve": "LTIR",
    suspension: "SUSP",
  };
  return values[status.trim().toLowerCase()] ?? status;
}

export function parseEspnInjuries(
  input: unknown,
  fetchedAt = Date.now(),
): InjuryReport {
  // Reject malformed snapshots as a whole instead of silently clearing badges.
  const report = espnReport.parse(input);
  const injuries = report.injuries.flatMap((team) =>
    team.injuries.map((injury) => ({
      id: injury.id,
      name: injury.athlete.displayName,
      team: getPlayerNhlAbbreviations(injury.athlete.team.abbreviation)[0]!,
      status: injury.status,
      designation: injuryDesignation(injury.status),
      description: injury.details?.type ?? null,
      comment:
        [injury.longComment, injury.shortComment]
          .map((comment) => comment?.trim())
          .find((comment) => Boolean(comment)) ?? null,
      updatedAt: injury.date ?? null,
      returnDate: injury.details?.returnDate ?? null,
    })),
  );
  return { fetchedAt, sourceUpdatedAt: report.timestamp, injuries };
}

function normalizedName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findPlayerInjury(
  injuries: readonly PlayerInjury[],
  name: string,
  teams: string | string[] | null | undefined,
): PlayerInjury | null {
  const abbreviations = getPlayerNhlAbbreviations(teams ?? null);
  // Multiple/historical teams are ambiguous; do not guess a current identity.
  if (abbreviations.length !== 1) return null;
  const matches = injuries.filter(
    (injury) =>
      normalizedName(injury.name) === normalizedName(name) &&
      injury.team === abbreviations[0],
  );
  return matches.length === 1 ? matches[0]! : null;
}

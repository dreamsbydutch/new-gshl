import { z } from "zod";

export const NHL_ORGANIZATION_REFRESH_SECONDS = 60 * 60;
export const nhlOrganizationPlayerSchema = z.object({
  nhlPlayerId: z.number().int().positive(),
  playerName: z.string().min(1),
  position: z.enum(["F", "D", "G"]),
  membership: z.enum(["nhl-roster", "organization"]),
});
export const nhlOrganizationsSchema = z.object({
  seasonId: z.number().int(),
  updatedAt: z.number().finite(),
  teams: z
    .array(
      z.object({
        abbr: z.string().regex(/^[A-Z]{2,3}$/),
        name: z.string().min(1),
        roster: z.array(nhlOrganizationPlayerSchema).max(200),
      }),
    )
    .min(1)
    .max(40),
});

const person = z.object({
  id: z.number().int().positive(),
  firstName: z.object({ default: z.string().min(1) }),
  lastName: z.object({ default: z.string().min(1) }),
});
export const nhlOrganizationSourceSchema = z.object({
  forwards: z.array(person).max(100),
  defensemen: z.array(person).max(100),
  goalies: z.array(person).max(50),
});

export const nhlOrganizationDirectorySchema = z
  .array(
    z.object({
      playerId: z.string().regex(/^[1-9]\d*$/),
      name: z.string().min(1),
      positionCode: z.enum(["C", "L", "R", "LW", "RW", "F", "D", "G"]),
      teamAbbrev: z.string().nullable(),
      active: z.boolean(),
    }),
  )
  .min(1)
  .max(9999); // The 10,000-row request limit must not be reached.

/** The roster source takes precedence over overlapping directory records. */
export function mergeNhlOrganizationSources(roster: unknown, depth: unknown) {
  const players = new Map<
    number,
    z.infer<typeof nhlOrganizationPlayerSchema>
  >();
  const source = nhlOrganizationSourceSchema.parse(roster);
  const rosterPlayers: z.infer<typeof nhlOrganizationPlayerSchema>[] = [];
  for (const [key, position] of [
    ["forwards", "F"],
    ["defensemen", "D"],
    ["goalies", "G"],
  ] as const)
    for (const p of source[key]) {
      rosterPlayers.push({
        nhlPlayerId: p.id,
        playerName: `${p.firstName.default} ${p.lastName.default}`,
        position,
        membership: "nhl-roster",
      });
    }
  for (const input of [
    rosterPlayers,
    z.array(nhlOrganizationPlayerSchema).max(200).parse(depth),
  ]) {
    const seen = new Set<number>();
    for (const p of input) {
      if (seen.has(p.nhlPlayerId))
        throw Error("Duplicate NHL organization source identity");
      seen.add(p.nhlPlayerId);
      const prior = players.get(p.nhlPlayerId);
      if (prior && prior.position !== p.position)
        throw Error("Conflicting NHL organization position");
      if (!prior) players.set(p.nhlPlayerId, p);
    }
  }
  return [...players.values()];
}

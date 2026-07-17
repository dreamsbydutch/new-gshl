export type TeamAwardPodium = {
  winnerId: string;
  nomineeIds: string[];
};

export function mapTeamAwardPodiumToOwners(
  podium: TeamAwardPodium,
  ownerIdByTeamId: ReadonlyMap<string, string>,
): { ownerId: string; nomineeIds: string[] } | null {
  const ownerId = ownerIdByTeamId.get(podium.winnerId);
  if (!ownerId) return null;

  return {
    ownerId,
    nomineeIds: Array.from(
      new Set(
        podium.nomineeIds
          .map((teamId) => ownerIdByTeamId.get(teamId))
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  };
}

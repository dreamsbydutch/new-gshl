import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { NativeNhlPlayer } from "../../domains/nhl/nightly-season-stats";
import { prepareNightlyIdentities } from "./nightly-identities";

export type HistoricalIdentityManifest = {
  version: "nhl-historical-identities-v1";
  sourceSha256: string;
  capturedAt: number;
  identities: Awaited<ReturnType<typeof prepareNightlyIdentities>>;
};
/** The import replays the official-ID/name/DOB/role checks solely from saved bodies. */
export async function auditHistoricalIdentityManifest(
  manifest: HistoricalIdentityManifest,
  sourceSha256: string,
  players: readonly NativeNhlPlayer[],
  now = Date.now(),
) {
  if (
    !manifest ||
    manifest.version !== "nhl-historical-identities-v1" ||
    manifest.sourceSha256 !== sourceSha256 ||
    !/^[a-f0-9]{64}$/.test(sourceSha256) ||
    !Number.isSafeInteger(manifest.capturedAt) ||
    manifest.capturedAt <= 0 ||
    manifest.capturedAt > now + 300000 ||
    !Array.isArray(manifest.identities)
  )
    throw Error("Invalid frozen historical identity manifest");
  const seen = new Set<number>();
  const byId = new Map(players.map((p) => [p.nhlPlayerId, p]));
  for (const identity of manifest.identities) {
    const official = identity.official;
    if (
      !official ||
      seen.has(official.nhlPlayerId) ||
      !byId.has(official.nhlPlayerId) ||
      official.sourceFetchedAt !== manifest.capturedAt ||
      createHash("sha256")
        .update(JSON.stringify(identity.source))
        .digest("hex") !== official.sourceSha256
    )
      throw Error("Historical identity body/hash/date/cohort mismatch");
    seen.add(official.nhlPlayerId);
    const replay = await prepareNightlyIdentities(
      [],
      [byId.get(official.nhlPlayerId)!],
      async (url) => {
        if (url !== official.sourceUrl)
          throw Error("Historical identity endpoint mismatch");
        return structuredClone(identity.source);
      },
    );
    if (
      !isDeepStrictEqual(
        { ...replay[0]!.official, sourceFetchedAt: manifest.capturedAt },
        official,
      )
    )
      throw Error("Frozen identity provenance does not replay");
  }
  return manifest.identities;
}

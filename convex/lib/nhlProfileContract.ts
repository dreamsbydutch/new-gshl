import type { Doc } from "../_generated/dataModel";
import type { NhlContractInput } from "./nhlContractFields";
import { toUtcTimestamp } from "./timestamps";

export function nhlProfileContract(
  player: Pick<
    Doc<"players">,
    | "_id"
    | "nhlStartYear"
    | "nhlExpiryYear"
    | "nhlContractLength"
    | "nhlSigningDate"
    | "nhlCapHit"
  >,
  seasonStartYear: number,
): NhlContractInput | null {
  const year = (value: unknown) =>
    typeof value === "string" && /^\d{4}(?:[-/]\d{2,4})?$/.test(value.trim())
      ? Number(value.trim().slice(0, 4))
      : NaN;
  const start = year(player.nhlStartYear);
  const expiry = year(player.nhlExpiryYear);
  const length = Number(player.nhlContractLength);
  const signed = toUtcTimestamp(player.nhlSigningDate);
  const capHit =
    typeof player.nhlCapHit === "number"
      ? player.nhlCapHit
      : typeof player.nhlCapHit === "string" && player.nhlCapHit.trim()
        ? Number(player.nhlCapHit.replace(/[$,\s]/g, ""))
        : NaN;
  if (
    !Number.isInteger(seasonStartYear) ||
    !Number.isInteger(start) ||
    start < 1900 ||
    expiry > 2200 ||
    !Number.isInteger(expiry) ||
    !Number.isInteger(length) ||
    length < 1 ||
    length > 30 ||
    expiry - start + 1 !== length ||
    seasonStartYear < start ||
    seasonStartYear > expiry ||
    signed === null ||
    signed % 86_400_000 !== 0 ||
    !Number.isFinite(capHit) ||
    capHit < 0
  )
    return null;
  return {
    playerId: player._id,
    signingDate: signed,
    startSeasonStartYear: start,
    expirySeasonStartYear: expiry,
    length,
    seasonStartYear,
    capHit,
    source: "player-profile",
    sourceRef: `players:${player._id}`,
  };
}

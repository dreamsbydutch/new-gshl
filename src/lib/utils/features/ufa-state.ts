import type {
  UfaOfferProbability,
  UfaPublicGroup,
  UfaPublicOffer,
  UfaPublicState,
} from "@gshl-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function toNumberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeGroup(value: unknown): UfaPublicGroup | null {
  if (!isRecord(value)) return null;
  const id = toStringValue(value.id ?? value._id);
  if (!id) return null;
  return {
    _id: toStringValue(value._id ?? value.id),
    id,
    playerId: toStringValue(value.playerId),
    seasonId: toStringValue(value.seasonId),
    deadlineAt: toNumberValue(value.deadlineAt),
    status: toStringValue(value.status),
  };
}

function normalizeOffer(value: unknown): UfaPublicOffer | null {
  if (!isRecord(value)) return null;
  const id = toStringValue(value.id);
  if (!id) return null;
  return {
    id,
    groupId: toStringValue(value.groupId),
    franchiseId: toStringValue(value.franchiseId),
    contractLength: toNumberValue(value.contractLength),
    salary: toNumberValue(value.salary),
    status: toStringValue(value.status),
    isMine: value.isMine === true,
  };
}

function normalizeProbability(value: unknown): UfaOfferProbability | null {
  if (!isRecord(value)) return null;
  const offerId = toStringValue(value.offerId);
  if (!offerId) return null;
  return {
    offerId,
    probability: toNumberValue(value.probability),
  };
}

export function normalizeUfaPublicState(value: unknown): UfaPublicState {
  if (!isRecord(value)) {
    return { groups: [], offers: [], oddsByGroup: {} };
  }

  const groups = Array.isArray(value.groups)
    ? value.groups
        .map(normalizeGroup)
        .filter((group): group is UfaPublicGroup => group !== null)
    : [];
  const offers = Array.isArray(value.offers)
    ? value.offers
        .map(normalizeOffer)
        .filter((offer): offer is UfaPublicOffer => offer !== null)
    : [];
  const oddsByGroup: Record<string, UfaOfferProbability[]> = {};

  if (isRecord(value.oddsByGroup)) {
    for (const [groupId, entries] of Object.entries(value.oddsByGroup)) {
      oddsByGroup[groupId] = Array.isArray(entries)
        ? entries
            .map(normalizeProbability)
            .filter((entry): entry is UfaOfferProbability => entry !== null)
        : [];
    }
  }

  return { groups, offers, oddsByGroup };
}

import { coerceDate, normalizeDateOnlyValue } from "../core/date";

export const UFA_OFFER_MS = 7 * 24 * 60 * 60 * 1_000;

/** The latest season whose draft/season has begun owns the next signing period. */
export function resolveUfaSigningSeason<
  T extends {
    year: string | number;
    startDate?: string | number | null;
    draftStartAt?: string | number | null;
    isActive?: boolean;
  },
>(seasons: readonly T[], now = Date.now()): T | undefined {
  const started = seasons.filter((season) => {
    const start = coerceDate({
      value: season.draftStartAt ?? season.startDate,
    });
    return start && start.getTime() <= now;
  });
  return (
    started.sort((a, b) => Number(b.year) - Number(a.year))[0] ??
    seasons.find((season) => season.isActive)
  );
}

/** Signing deadlines include the full Toronto day; the draft cutoff is exact. */
export function isUfaOfferWindowOpen(
  signingEndDate: string | number | null | undefined,
  draftStartAt: string | number | null | undefined,
  now = Date.now(),
): boolean {
  const signingEnd = normalizeDateOnlyValue(signingEndDate);
  const draftStart = coerceDate({ value: draftStartAt });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  return Boolean(
    signingEnd &&
      draftStart &&
      today > signingEnd &&
      now < draftStart.getTime(),
  );
}

export function getUfaOfferGroupDeadline(options: {
  submittedAt: number;
  existingDeadlineAt?: number;
  existingOfferSubmittedAt?: readonly number[];
}) {
  const {
    submittedAt,
    existingDeadlineAt,
    existingOfferSubmittedAt = [],
  } = options;
  const firstOfferSubmittedAt = Math.min(
    submittedAt,
    ...existingOfferSubmittedAt,
  );
  const deadlineFromFirstOffer = firstOfferSubmittedAt + UFA_OFFER_MS;

  return existingDeadlineAt === undefined
    ? deadlineFromFirstOffer
    : Math.min(existingDeadlineAt, deadlineFromFirstOffer);
}

export const UFA_OFFER_MS = 7 * 24 * 60 * 60 * 1_000;

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

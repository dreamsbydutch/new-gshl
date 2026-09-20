# Owner accounts

Commissioner-only accounting for all current and former owners. Existing
`owners.owing` is the opening balance; preserve it and keep it synchronized with
new ledger activity. Money is calculated in integer cents (CAD).

## Requirements

- Accounts tab in admin: searchable owners, active/former filter, balances,
  separate total outstanding and credits; select an owner for history.
- Record positive charges, payments, credits, and refunds with effective date,
  description and optional payment reference. Charges/refunds increase owing;
  payments/credits reduce it. Store creator and creation timestamp.
- Correct mistakes by voiding an entry with a required reason, actor and time;
  retain the original. Opening balances are clearly identified.
- Automatic annual fee calculation from teams in a selected season and their
  franchise owners. Default $60 per team from rulebook. Preview owner charges
  before explicitly assessing. Configurable positive amount. Transactional,
  idempotent once per season/team; voiding does not silently re-assess a fee.
  No automatic historical backfill: existing owing may already include fees.
- All reads and writes enforce active commissioner authorization server-side.
  Validate money/date/text and missing owners, prevent duplicate submissions,
  keep balance updates atomic, paginate indexed owner history.
- Accessible mobile layout, loading/error/empty states and pending feedback.

## Task graph

1. Backend: schema, accounting API, validation and focused tests.
2. Frontend (API contract below): hooks, accounts UI; can run alongside 1.
3. Integration (blocked by 1/2): navigation, generated API, verification.
4. Review (blocked by 3): standards/spec reviews and corrections, ready PR.

## API contract (convex/accounts.ts)

- overview({}): { owners: [{ _id, firstName, lastName, isActive, balanceCents }],
  seasons: [{ _id, name }] }
- history({ ownerId, paginationOpts }): standard Convex pagination of entries
  descending by creation. Entry: _id, kind (charge/payment/credit/refund/opening),
  amountCents (positive except signed opening), effectiveAt (UTC ms), description,
  reference?, createdAt, createdBy (actor ID), voidedAt?, voidReason?, voidedBy?.
- record({ ownerId, kind (charge/payment/credit/refund), amountCents, effectiveAt,
  description, reference?, requestId }): writes entry and updates balance.
- voidEntry({ entryId, reason }): reverses entry once; cannot void opening.
- feePreview({ seasonId, amountCents }): [{ teamId, ownerId, ownerName,
  teamName, amountCents, assessed: boolean }].
- assessFees({ seasonId, amountCents }): { created: number }; validates all
  eligible rows, skips already assessed teams, stores season/team fee identity.

No remote database deployment is part of implementation. No issue/ticket IDs
were supplied; this document is the local spec and task graph.

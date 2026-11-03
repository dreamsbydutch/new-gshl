# App hardening: 20 passes

Each pass used a different objective, followed the active entry point into its
dependencies, and kept changes within the existing architecture. These are
targeted checks, not a comprehensive security audit. No live data or deployment
was used. A pass does not require a change when an existing guard covers it.

| Pass | Objective and inspected entry point                                                                          | Outcome                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Prevent redirect escapes after URL normalization (`auth-callback.ts`)                                        | Reject normalized paths beginning with `//`; regression reproduced before the fix.                                                        |
| 2    | Preserve callback queries safely (`buildInternalCallbackPath`)                                               | Existing URLSearchParams encoding and repeated-value tests cover query injection. No change.                                              |
| 3    | Reject cross-origin and non-HTTP callbacks (`resolveRequestCallbackPath`)                                    | Existing origin/protocol checks and forwarded-origin tests pass. No change. Proxy headers still depend on trusted hosting.                |
| 4    | Deny disabled commissioners image uploads (`uploadthing.ts`)                                                 | Require active status as well as commissioner role.                                                                                       |
| 5    | Keep bearer-token responses out of caches (`api/convex/token`)                                               | Explicit `Cache-Control: no-store` on success and unauthorized responses.                                                                 |
| 6    | Verify Google identity before account linking (`auth.ts` signIn callback)                                    | Verified email and Google provider subject are required. No change.                                                                       |
| 7    | Enforce authorization in stored-data handlers (`convex/lib/auth.ts`)                                         | Active status is read from the database; owner and commissioner helpers enforce roles. No change.                                         |
| 8    | Protect account administration (`convex/authUsers.ts`)                                                       | Server secret is required and absent configuration fails closed; conflicting subject/email links are rejected. No change.                 |
| 9    | Separate signing keys from public key discovery (`convex-token.ts`, JWKS route)                              | Public key is derived before JWK export; token has audience, issuer and expiry. No change.                                                |
| 10   | Prevent cross-origin diagnostic submissions (`api/nhl/client-error`)                                         | Origin check precedes authentication/body processing. No change.                                                                          |
| 11   | Bound diagnostic submission frequency and key storage (same route)                                           | Existing per-user cooldown and map bound retained. This remains per-process protection, not a distributed rate limiter.                   |
| 12   | Bound chunked request memory (same route)                                                                    | Replace whole-body buffering with an 8192-byte streaming limit and cancellation. Tests cover missing Content-Length and oversized chunks. |
| 13   | Handle broken diagnostic streams (same route)                                                                | Stream errors now become controlled 400 responses through the bounded reader. Test covers disconnection.                                  |
| 14   | Prevent quoted credential leaks (`nhl-explorer-error.ts`)                                                    | Redact quoted JSON/key-value credential values, including spaces; regression reproduced before the fix.                                   |
| 15   | Remove relative URL query/fragment data from diagnostics (same sanitizer)                                    | Strip relative URL query and fragment values in addition to existing absolute URL sanitization.                                           |
| 16   | Prevent automatic chunk reload loops (`useNhlExplorerRecovery`)                                              | Existing persistent storage guard fails closed when storage is blocked; focused tests pass. No change.                                    |
| 17   | Bound public NHL request parameters (`api/nhl`, game and roster routes)                                      | Season validation, ten-digit game IDs and 1–31 day date ranges already constrain inputs. No change.                                       |
| 18   | Bound upstream waiting (`nhl-data.ts`, leaders/organizations loaders, injuries)                              | Existing fetches use timeouts and fixed upstream endpoints. No change.                                                                    |
| 19   | Keep optional upstream failures from breaking game details (`loadNHLGame`)                                   | Play-by-play and stars fail independently to null; game identity is checked before return. No change.                                     |
| 20   | Protect notification device ownership and outbound destinations (`notifications.ts`, notification utilities) | Existing user ownership checks, provider endpoint allowlist and 20-device cap retained. No change.                                        |

Verification: focused callback, diagnostic sanitization and bounded-reader tests;
changed-file ESLint; app/backend TypeScript and frontend architecture checks.
All 17 focused tests and changed-file ESLint pass. TypeScript emitted no errors.
The architecture check flags the pre-existing
`src/hooks/main/usePowerRankings.test.tsx` filename; that file and the checker
are identical to the base commit. Sol review approved in two rounds after fixing
root-relative query/fragment redaction. No findings remain open; usage was not
reported. The new regressions for callback escapes and redaction failed before
their respective fixes.
No production calls, browser sessions, dependency upgrades or ranking changes.

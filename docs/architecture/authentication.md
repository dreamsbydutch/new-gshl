# Authentication and authorization

[Wiki home](../README.md) · [Architecture overview](./overview.md) · [Convex](./convex.md) · [Data model](./data-model.md)

## Components

| Path                                                                           | Responsibility                                                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [`auth.ts`](../../auth.ts)                                                     | Auth.js Google provider, callbacks, JWT/session projection, and route authorization |
| [`middleware.ts`](../../middleware.ts)                                         | Auth.js middleware matcher for protected route families                             |
| [`src/lib/auth/user-store.ts`](../../src/lib/auth/user-store.ts)               | Trusted Auth.js-to-Convex account bridge                                            |
| [`src/lib/auth/convex-token.ts`](../../src/lib/auth/convex-token.ts)           | RS256 Convex access-token signing and JWKS generation                               |
| [`src/app/api/convex/token/route.ts`](../../src/app/api/convex/token/route.ts) | Active-session token endpoint                                                       |
| [`src/app/api/convex/jwks/route.ts`](../../src/app/api/convex/jwks/route.ts)   | Public key-set endpoint                                                             |
| [`convex/auth.config.ts`](../../convex/auth.config.ts)                         | Convex custom-JWT issuer, audience, JWKS, and algorithm configuration               |
| [`convex/lib/auth.ts`](../../convex/lib/auth.ts)                               | Convex identity and role guards                                                     |
| [`convex/authUsers.ts`](../../convex/authUsers.ts)                             | Shared-secret account upsert/lookup/administration                                  |
| [`src/lib/auth/require-user.ts`](../../src/lib/auth/require-user.ts)           | Server-component active-user redirect guard                                         |

## Sign-in and token flow

```text
Google OAuth
  → Auth.js signIn callback
  → verify Google provider, subject, email, and email_verified
  → server-secret authUsers:upsertGoogleUser
  → active Auth.js JWT/session

Browser Convex provider
  → POST /api/convex/token with Auth.js cookie
  → verify active session
  → sign one-hour RS256 JWT
       sub = Convex authUsers document ID
       iss = CONVEX_AUTH_ISSUER
       aud = gshl
       kid = CONVEX_AUTH_KEY_ID
  → Convex verifies against /api/convex/jwks
  → ctx.auth.getUserIdentity()
  → requireActiveUser loads authUsers[sub] and checks current status/role
```

Auth.js sessions use the JWT strategy with a 30-day maximum. The Convex access token lasts one hour and is fetched with `cache: no-store`. The JWKS response is publicly cacheable for one hour.

The JWT subject is an application user ID, not the Google subject and not an owner ID.

## Account lifecycle

`authUsers` stores Google subject, normalized email, display name/image, role, optional owner link, status, creation/update time, and last login.

- First verified Google sign-in creates an `active` `viewer` account.
- A matching email can be connected to a new Google subject, but conflicting subject/email records fail closed.
- Existing sign-in refreshes profile fields and `lastLoginAt` without changing role, owner, or status.
- Disabled users cannot complete a new sign-in, are denied protected routes, and fail Convex `requireActiveUser` even if an older browser token still exists.
- The first commissioner is bootstrapped by changing the initial account in the Convex dashboard after schema deployment. Subsequent access changes should use League Office.

There is no pending status. “Viewer until approved” means the account has active read access but no owner or commissioner mutation privileges.

## Roles and permissions

| Capability                                         | Anonymous | Active viewer | Active owner |   Active commissioner   |        Server secret        |
| -------------------------------------------------- | :-------: | :-----------: | :----------: | :---------------------: | :-------------------------: |
| Public league/stat/publication reads               |    Yes    |      Yes      |     Yes      |           Yes           |             Yes             |
| Protected app routes and private owner fields      |    No     |      Yes      |     Yes      |           Yes           |             N/A             |
| Authenticated draft state                          |    No     |      Yes      |     Yes      |           Yes           |             N/A             |
| Change own roster `lineupPos`                      |    No     |      No       |     Yes      |           Yes           |      Via operator APIs      |
| Submit on-clock draft pick                         |    No     |      No       |   Own team   |           Yes           |      No dedicated path      |
| Submit UFA offer                                   |    No     |      No       | Linked owner | Linked owner if present | Trusted explicit owner path |
| Draft undo/admin, contracts, users, jobs, newsroom |    No     |      No       |      No      |           Yes           |      Via operator APIs      |
| Upload images                                      |    No     |      No       |      No      |           Yes           |             N/A             |
| Generic reads/writes, migrations, table clearing   |    No     |      No       |      No      |           No            |             Yes             |

Convex guards:

- `requireActiveUser`: identity exists and referenced user is active.
- `requireOwnerOrCommissioner`: active role is owner or commissioner.
- `requireCommissioner`: active role is commissioner.
- `requireOwnerAccess`: commissioner or the owner whose `ownerId` matches the resource.

An owner account must link to an active `owners` record. The shared-secret access mutation also prevents two accounts from linking to the same owner. The commissioner UI mutation prevents a commissioner from removing their own commissioner/active access and requires owners to have an owner link.

## Route protection

[`middleware.ts`](../../middleware.ts) matches:

- `/lockerroom/:path*`
- `/draft/:path*`
- `/draftboard/:path*`
- `/leagueoffice/:path*`

Relevant pages also call the server-only `requireActiveUser`. This duplicate protection is intentional defense in depth. Middleware and page guards preserve the complete same-app path and query string as the sign-in callback. The sign-in page accepts relative or same-origin callbacks and rejects cross-origin, protocol-relative, backslash-normalized, and non-HTTP destinations before redirecting.

Route protection does not authorize data mutations. Every Convex handler must still apply the correct guard, and commissioner-only UI visibility must never be the sole control.

## Data privacy

- Anonymous `frontend:owners` and enriched `frontend:teams` responses replace owner email with null and owing with zero/null.
- Active authenticated users receive those private fields.
- `ufa:publicState` omits offer owner IDs and reports only whether an offer belongs to the current user.
- `weeklyEditions` public readers return only published editions and filter inactive sections.
- `authUsers` browser listing and all newsroom/job administration require a commissioner.

Review every new browser query for field-level exposure; query visibility and row authorization are separate decisions.

## Service credentials

Credential values never belong in documentation, source control, logs, screenshots, reports, or client-exposed environment variables.

### Next.js runtime

| Variable                               | Use                                                                 |
| -------------------------------------- | ------------------------------------------------------------------- |
| `AUTH_SECRET`                          | Auth.js cookie/JWT security; at least 32 characters                 |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth application                                            |
| `NEXT_PUBLIC_CONVEX_URL`               | Browser Convex deployment URL; intentionally public                 |
| `CONVEX_URL`                           | Server-side Convex URL fallback                                     |
| `CONVEX_SERVER_SECRET`                 | Trusted Next.js-to-Convex calls; must match Convex env              |
| `CONVEX_AUTH_PRIVATE_KEY`              | RSA private key used only by Next.js to sign Convex tokens          |
| `CONVEX_AUTH_KEY_ID`                   | JWT/JWKS key identifier                                             |
| `CONVEX_AUTH_ISSUER`                   | Public application origin/issuer used by signer and Convex verifier |
| `UPLOADTHING_TOKEN`                    | UploadThing service credential                                      |

### Convex deployment

| Variable                | Use                                                  |
| ----------------------- | ---------------------------------------------------- |
| `CONVEX_SERVER_SECRET`  | Validates trusted operator/server functions          |
| `CONVEX_AUTH_ISSUER`    | Loads the application JWKS and validates JWT issuer  |
| `BROWSER_WORKER_SECRET` | Validates outbound browser-worker leases and results |

### Browser worker/operator machine

| Variable                     | Use                                          |
| ---------------------------- | -------------------------------------------- |
| `CONVEX_URL`                 | Exact deployment used by the worker          |
| `BROWSER_WORKER_SECRET`      | Must match Convex env                        |
| `BROWSER_WORKER_ID`          | Optional stable lease owner name             |
| `BROWSER_EXECUTABLE_PATH`    | Local Chromium-compatible executable         |
| `YAHOO_BROWSER_PROFILE_PATH` | Optional authenticated Yahoo browser profile |

The repository intentionally ignores `.env`, `.env*.local`, `credentials.json`, `.yahoo-cookie.txt`, and private key files. Do not inspect or reproduce their contents during documentation or debugging.

## Key rotation

- Rotating `CONVEX_SERVER_SECRET` requires coordinated updates in the Convex deployment and every trusted Next.js/script environment.
- Rotating the RSA private key requires publishing a matching JWKS key. Keep `CONVEX_AUTH_KEY_ID` aligned; changing the key invalidates newly verified tokens until Convex sees the matching public key.
- Rotating `AUTH_SECRET` invalidates existing Auth.js sessions.
- Rotating `BROWSER_WORKER_SECRET` requires updating both Convex and the worker before it can lease again.

After rotation, test sign-in, `/api/convex/token`, one protected Convex query, one denied role path, and the intended operator/worker connection without printing a token or secret.

## Common failure modes

| Symptom                                            | Likely boundary to inspect                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Google sign-in rejected                            | Provider credentials, callback URL, verified email, or disabled `authUsers` record                          |
| App session exists but Convex says unauthenticated | Issuer mismatch, missing/private signing key, key ID/JWKS mismatch, or stale generated/deployed auth config |
| Protected page redirects to sign-in                | Missing `AUTH_SECRET`, absent session, or non-active status                                                 |
| Viewer can see a control but mutation fails        | Expected backend role enforcement; fix UI visibility without weakening the guard                            |
| Owner mutation says forbidden                      | Missing/wrong `authUsers.ownerId` or resource belongs to a different owner                                  |
| Trusted script says unauthorized                   | `CONVEX_SERVER_SECRET` mismatch or script pointed at the wrong deployment                                   |
| Worker cannot lease                                | Worker secret mismatch, wrong Convex URL, or missing browser executable                                     |

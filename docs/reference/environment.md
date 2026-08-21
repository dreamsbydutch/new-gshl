# Environment

[Wiki home](../README.md)

This page documents environment and Apps Script property names, never their
values. Secret values belong in local secret stores, the hosting environment,
the Convex deployment, or Apps Script project properties. Do not paste them in
issues, reports, terminal transcripts, or Markdown.

## Files and loading

- `.env.example` is the checked-in name catalog for common local setup.
- `.env.local` is the normal root secret file and must remain untracked.
- The Next.js app validates its declared variables through `src/env.js`.
- Scripts load root and package environment files and also read several
  command-specific variables directly from `process.env`.
- Apps Script uses constants in `apps-script/Config/Config.js` and project
  Script Properties, not Node environment variables.

The scripts environment loader searches `../.env`, `../.env.local`, `.env`, and
`.env.local` when commands are run from `scripts/`. Already-defined process
variables are not replaced by later files.

## Names currently present in `.env.example`

- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_SECRET`
- `BROWSER_EXECUTABLE_PATH`
- `BROWSER_WORKER_ID`
- `BROWSER_WORKER_SECRET`
- `CONVEX_SERVER_SECRET`
- `CONVEX_URL`
- `GSHL_DATA_BACKEND`
- `NEXT_PUBLIC_CONVEX_URL`
- `UPLOADTHING_TOKEN`
- `USE_GOOGLE_SHEETS`
- `YAHOO_BROWSER_PROFILE_PATH`

The example is not exhaustive. The remaining active names are grouped below.
`DATABASE_URL` and `DIRECT_URL` appear only in commented create-t3 scaffolding
inside `src/env.js`; they are not active configuration.

## Application and authentication

| Name                  | Used for                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`            | Runtime mode validated by the app.                                                      |
| `SKIP_ENV_VALIDATION` | Intentional bypass of Next environment validation, such as a constrained build context. |
| `AUTH_SECRET`         | Auth.js signing and session security.                                                   |
| `AUTH_GOOGLE_ID`      | Google OAuth client identity.                                                           |
| `AUTH_GOOGLE_SECRET`  | Google OAuth client secret.                                                             |
| `UPLOADTHING_TOKEN`   | UploadThing server integration.                                                         |
| `CRON_SECRET`         | Declared by `src/env.js`; no current code consumer was found.                           |

Authentication-related fields are optional in the schema so some builds can
start without them, but the corresponding feature fails or remains unavailable
when its required names are absent.

## Convex and data-backend selection

| Name                          | Used for                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `GSHL_DATA_BACKEND`           | Select the Convex or Sheets data adapter.                                         |
| `GSHL_CONVEX_TARGET`          | Select development or production for operator scripts.                            |
| `CONVEX_URL`                  | Server or worker Convex endpoint.                                                 |
| `NEXT_PUBLIC_CONVEX_URL`      | Browser Convex endpoint and development-script fallback.                          |
| `CONVEX_PROD_URL`             | Explicit production endpoint for production-backed scripts.                       |
| `CONVEX_DEPLOYMENT`           | Convex deployment identity; scripts recognize production deployment metadata.     |
| `CONVEX_DEPLOY_KEY`           | Convex deployment credential and production-target signal.                        |
| `CONVEX_SERVER_SECRET`        | Shared secret for protected app, maintenance, archive, and managed-job functions. |
| `CONVEX_AUTH_PRIVATE_KEY`     | Private key used to mint Convex authentication tokens.                            |
| `CONVEX_AUTH_KEY_ID`          | Key identifier exposed through the application JWKS.                              |
| `CONVEX_AUTH_ISSUER`          | Issuer used by the application token and Convex auth configuration.               |
| `CONVEX_MIGRATION_BATCH_SIZE` | Batch size for the Sheets-to-Convex migration command.                            |

Production-backed scripts require explicit production identification. They
refuse to silently use `NEXT_PUBLIC_CONVEX_URL` as a production target.

The destructive `convex:migrate` command is an exception: it bypasses
`GSHL_CONVEX_TARGET` and `CONVEX_PROD_URL` and uses only
`NEXT_PUBLIC_CONVEX_URL`. Verify that exact endpoint independently before an
authorized migration.

## Google Sheets and Apps Script access

| Name                              | Used for                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| `USE_GOOGLE_SHEETS`               | Enable Sheets-dependent compatibility and migration paths. |
| `GOOGLE_SERVICE_ACCOUNT_KEY`      | Inline Google service-account material.                    |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | Path to Google service-account material.                   |
| `GOOGLE_APPS_SCRIPT_ID`           | Remote Apps Script project used by parity execution.       |
| `GOOGLE_APPS_SCRIPT_ACCESS_TOKEN` | Authentication for remote Apps Script execution.           |

Use only one supported service-account input. Never document the key contents
or inspect a credential file merely to discover its name.

## Managed browser worker

| Name                         | Used for                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| `BROWSER_EXECUTABLE_PATH`    | Browser executable launched by the worker.                       |
| `BROWSER_WORKER_ID`          | Worker lease identity.                                           |
| `BROWSER_WORKER_SECRET`      | Shared secret protecting external-task lease operations.         |
| `YAHOO_BROWSER_PROFILE_PATH` | Existing authenticated Yahoo browser profile used by the worker. |

The worker also needs a Convex endpoint. See
[Managed jobs](../operations/managed-jobs.md).

## Yahoo and browser-assisted operator scripts

Authentication inputs:

- `YAHOO_COOKIE`
- `YAHOO_COOKIE_FILE`
- `YAHOO_HEADERS_JSON`
- `YAHOO_HEADERS_FILE`

Request and league configuration:

- `YAHOO_LEAGUE_ID`
- `YAHOO_ACCEPT_LANGUAGE`
- `YAHOO_USER_AGENT`
- `YAHOO_REQUEST_DELAY_MS`
- `YAHOO_REQUEST_DENIED_COOLDOWN_MS`
- `YAHOO_REQUEST_JITTER_MS`
- `YAHOO_RETRY_COUNT`
- `YAHOO_RETRY_DELAY_MS`
- `YAHOO_WEEKLY_CHECK_REQUEST_STAGGER_MIN_MS`
- `YAHOO_WEEKLY_CHECK_REQUEST_STAGGER_MS`

Browser fallback configuration:

- `YAHOO_BROWSER_FALLBACK`
- `YAHOO_BROWSER_HEADLESS`
- `YAHOO_BROWSER_IMPORT_COOKIE`
- `YAHOO_BROWSER_PATH`
- `YAHOO_BROWSER_USER_DATA_DIR`
- `YAHOO_BROWSER_WAIT_MS`
- `PUCKPEDIA_BROWSER_PATH`

Browser discovery may also inspect `CHROME_PATH`, `EDGE_PATH`, and the operating
system's `LOCALAPPDATA`. Those are machine-level inputs, not application
secrets.

## Archive storage

| Name                   | Used for                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `GSHL_ARCHIVE_DB_PATH` | Override the default completed-season SQLite archive path. |

See [Player-day archive](../operations/player-day-archive.md) before changing
the location. The database, portable backups, and pre-delete snapshots must be
kept together and recoverable.

## Apps Script configuration names

Project constants in `apps-script/Config/Config.js` include:

- `SPREADSHEET_ID`
- `CURRENT_PLAYERDAY_SPREADSHEET_ID`
- `PLAYERDAY_WORKBOOKS`
- `PLAYERSTATS_SPREADSHEET_ID`
- `TEAMSTATS_SPREADSHEET_ID`
- `YAHOO_LEAGUE_ID`
- `ENABLE_VERBOSE_LOGGING`
- `ENABLE_DRY_RUN_MODE`

Supported Script Properties:

- `VERBOSE_LOGGING`
- `DRY_RUN_MODE`

Script Properties override the corresponding runtime defaults. Manage them in
Apps Script; do not add their values to Node environment files.

The checked-in dry-run default is false. Even when the property is enabled,
some entry points still manage triggers or ensure sheet columns before their
write guards; see [Apps Script operations](../operations/apps-script.md).

## Safe configuration checks

- Confirm a name exists without printing its value.
- Verify the intended target before any production or destructive command.
- Keep the application and Convex deployment copies of shared secrets aligned.
- Rotate a credential through its owning service, then update all consumers.
- Do not use `SKIP_ENV_VALIDATION` to conceal a missing production requirement.

## Related pages

- [Local development](../getting-started/local-development.md)
- [Deployment](../operations/deployment.md)
- [Managed jobs](../operations/managed-jobs.md)
- [Troubleshooting](../operations/troubleshooting.md)

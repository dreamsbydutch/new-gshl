# Draft reliability investigation

[Wiki home](../README.md) · [Troubleshooting](troubleshooting.md)

## Incident and confidence

Reported window: September 19, 2026, 8–11 p.m. America/Toronto
(September 20, 00:00–03:00 UTC). Fourteen owners used the draft hub;
reported symptoms included frozen tabs, failure to load, and client-side
exception pages on Best Available and TV displays.

Local reproductions establish two defects. They do not establish that every
incident came from these defects: no incident browser stack traces or production
query logs were available to this investigation, and this was not a concurrent
production load test. The local checkout includes changes committed during the
incident window; deployed versions were not verified.

## Reproduced defects and fixes

### TV row-capacity feedback loop

`DraftPickRail` and the Best Available `AvailablePanel` estimate capacity from
the tallest currently visible row. A tall wrapped row can reduce capacity enough
to hide itself. The next layout effect sees only shorter rows and increases
capacity, including the tall row again. Repeated synchronous state updates can
throw [React error 185](https://react.dev/errors/185) (maximum update depth
exceeded) and unmount the display.

The browser regression uses real components with controlled unequal row heights.
Before the fix, the rail threw error 185 and rendered zero rows. Both displays
now settle without exceptions. Measurements retain the tallest observed row for
the current panel dimensions; resizing resets that estimate. This deliberately
favors a conservative row count over oscillation. Pick-rail gaps use layout
offsets so animation transforms do not affect capacity.

### Synchronous full-draft simulation

`useDraftHubBoard` simulated all remaining picks to show recommendations for
only the active pick and five upcoming picks. Each simulated selection runs
roster optimization. A synthetic 14-team, 210-pick, 1,000-player benchmark took
46,400 ms for the full projection and 55 ms for the first six on the local
machine; a repeat measured 96,510 ms and 92 ms respectively under local load.
These are individual diagnostic measurements, not service latency
guarantees or measurements from the incident.

The hub now requests six projected picks. Its memo depends on the remote draft
snapshot rather than the clock-derived status object, preventing recomputation
on every second after clock expiry. The browser regression exercises the real
feature hook and projection algorithm, verifies six recommendations, and checks
that expired-clock ticks retain the same projection object.

## Reproduce locally

These commands use synthetic data and do not submit live picks. Browser tests
use local Microsoft Edge by default; `TV_TEST_BROWSER` can specify another
Chromium executable.

```powershell
node tools/tests/draft-capacity.browser.mjs
node tools/tests/draft-hub-performance.browser.mjs
node node_modules/tsx/dist/cli.mjs tools/tests/draft-projection-performance.ts
node node_modules/tsx/dist/cli.mjs --test convex/draft.test.ts src/lib/utils/features/draft-hub.test.ts src/lib/utils/features/mock-draft.test.ts
```

The projection benchmark intentionally includes the slow full-draft baseline.
The existing TV layout test also requires its generated stylesheet:

```powershell
node node_modules/tailwindcss/lib/cli.js -i src/styles/globals.css -o .next/draft-tv-test.css --content './src/components/draft/**/*.tsx,./src/components/admin/TvDisplays.tsx'
node tools/tests/draft-tv.browser.mjs
npm.cmd run check
```

## Before the next draft

1. Deploy and verify the fixes on the actual draft and TV URLs.
2. Add retained browser exception reporting with route, release identifier,
   timestamp, stack trace, and an appropriate source-map workflow. Capture
   unhandled promise rejections and provide a recoverable error screen. Avoid
   credentials and complete query payloads. This instrumentation is not part of
   the current fix.
3. Rehearse on an isolated deployment with representative data, fourteen owner
   sessions plus the TV screens, and a three-hour session. Exercise normal picks,
   expiry/Auto, undo, sorting/search, reconnects, and token refresh. Record pick
   submission-to-display latency, long browser tasks, exceptions, and query errors.
4. Inspect production logs for the incident window if retained. A Convex query
   exception can also reach React rendering; query-limit, authentication, and
   network failures remain unconfirmed possibilities, not established causes.
5. Bound or paginate the full player table and review unscoped contract reads
   if the rehearsal still shows slow rendering or excessive query costs. The
   current fixes do not certify backend capacity or remove every expensive path.

No production deployment or data mutation was performed during this investigation.

## Verification record

- Passed: 59 focused draft/clock/projection tests, frontend architecture,
  variable-height and single-row-gap browser regressions, full-pool hook browser
  regression, formatting, relative documentation links, and focused diff checks.
- The existing TV browser suite passed at 720p, 1080p, and 4K. One run failed its
  reduced-motion timing assertion; the complete rerun passed. A later browser
  launch hit a temporary-profile error under memory pressure; retry passed the
  capacity regressions.
- Full root lint and TypeScript were attempted but interrupted under local
  memory pressure (264 MB free of 6 GB). They are not certified by this record.
- Production build, deployment, production-log review, and a three-hour,
  fourteen-client rehearsal were not performed.
- Local runtime was Node 24.19.0 / npm 11.17.0, rather than the repository's
  declared Node 20 / npm 10.1.0.

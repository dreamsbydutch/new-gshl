# GSHL wiki

This wiki explains the product, the implementation, and the operating model for
humans and coding agents. It is organized by intent rather than by file type.
Use [AGENTS.md](../AGENTS.md) for the short, mandatory working rules.

## Product north star

GSHL is becoming one auditable platform for running and presenting the full
league lifecycle: public competition history, owner self-service, commissioner
operations, draft and contract workflows, editorial coverage, and reliable
data ingestion and analytics. The current implementation keeps Convex as the
live application data path while preserving the Google Sheets and Apps Script
workflows that have not yet been intentionally retired.

That is a direction, not a claim that every migration is complete. Each page
below labels current behavior, compatibility surfaces, generated copies, and
known operational gaps.

## Choose a reading path

| If you need to...                          | Read                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the product and league concepts | [Vision](product/vision.md), then [feature catalog](product/features.md)                                                                                    |
| Change a page or feature                   | [Frontend architecture](architecture/frontend.md), [route map](reference/routes.md), then the relevant feature code                                         |
| Change Convex data or behavior             | [Convex backend](architecture/convex.md), [data model](architecture/data-model.md), and [authentication](architecture/authentication.md)                    |
| Set up the repository                      | [Local development](getting-started/local-development.md), [environment](reference/environment.md), and [commands](reference/commands.md)                   |
| Run or change an operator command          | [Data pipelines](operations/data-pipelines.md), [`scripts/README.md`](../scripts/README.md), and [verification](operations/verification.md)                 |
| Work on ratings or power                   | [Ranking engine](RANKING.md) and the `gshl-ranking` skill                                                                                                   |
| Deploy or operate services                 | [Deployment](operations/deployment.md), [managed jobs](operations/managed-jobs.md), and [Apps Script](operations/apps-script.md)                            |
| Archive completed-season player days       | [Player-day archive](operations/player-day-archive.md)                                                                                                      |
| Diagnose a failure                         | [Troubleshooting](operations/troubleshooting.md)                                                                                                            |
| Publish completed agent work               | [`gshl-preview-pr`](../.agents/skills/gshl-preview-pr/SKILL.md), then [deployment](operations/deployment.md) and [verification](operations/verification.md) |

## Product and domain

- [Vision and end goal](product/vision.md) - users, north star, migration posture,
  non-goals, and how to separate shipped behavior from intent
- [Feature catalog](product/features.md) - public, owner, commissioner, draft,
  contract, editorial, competition, and analytics surfaces

The official league rules are application content in
[`src/content/rulebook.ts`](../src/content/rulebook.ts), rendered at `/rulebook`.
The wiki explains software concepts; it does not duplicate the rulebook.

## Architecture

- [System overview](architecture/overview.md) - processes, boundaries, and
  source-of-truth map
- [Frontend](architecture/frontend.md) - App Router, components, hooks,
  navigation, types, utilities, loading, and styling
- [Convex backend](architecture/convex.md) - public APIs, domain modules,
  server-secret functions, jobs, crons, and generated code
- [Data model](architecture/data-model.md) - all table families, relationships,
  identifiers, timestamps, stat lineage, and archive data
- [Authentication and authorization](architecture/authentication.md) - Google
  OAuth, Auth.js, the Convex JWT bridge, roles, privacy, and server enforcement

## Operations

- [Data pipelines](operations/data-pipelines.md) - source ingestion, pure domain
  reconciliation, aggregates, adapters, and safe applies
- [Managed jobs and browser worker](operations/managed-jobs.md) - job states,
  schedules, locks, current parity limits, and external tasks
- [Apps Script runtime](operations/apps-script.md) - trigger surface, Sheets
  responsibilities, clasp, and synchronized files
- [Player-day archive](operations/player-day-archive.md) - SQLite, manifests,
  checksums, deletion safeguards, restore, and retention
- [Deployment](operations/deployment.md) - known Convex and Apps Script
  procedures and the intentionally undocumented hosting gap
- [Verification](operations/verification.md) - real command scopes, targeted
  tests, CI coverage, and completion checklist
- [Troubleshooting](operations/troubleshooting.md) - environment, auth, Convex,
  Yahoo/browser, native dependency, and runtime-drift diagnostics

## Reference

- [Routes and access](reference/routes.md) - page and API inventory
- [Commands](reference/commands.md) - root, operator, Apps Script, and Convex
  command index
- [Environment](reference/environment.md) - names-only configuration contract
- [Glossary](reference/glossary.md) - league, analytics, operations, identifier,
  and source-of-truth terminology

Detailed subsystem manuals remain close to their implementation:

- [`scripts/README.md`](../scripts/README.md) - operator flags and examples
- [`apps-script/README.md`](../apps-script/README.md) - runtime entry points
- [`RANKING.md`](RANKING.md) - ranking and power behavior

## Documentation contract

When code and docs disagree, verify current code and fix the documentation in
the same change. In particular:

- Mark a surface as current, compatibility, generated/synchronized, legacy, or
  intentionally unreferenced.
- Link to authoritative code instead of copying large schemas or option lists.
- Document behavior and invariants, not temporary implementation trivia.
- Add a new page only when it has a distinct owner or reading purpose; update
  this index when doing so.
- Keep secrets out of docs. Environment references list names and roles only.
- Ordinary repository formatting scripts omit `.md`; run an explicit Markdown
  format and link check after wiki changes.

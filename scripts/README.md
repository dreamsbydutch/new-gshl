# GSHL Scripts

Standalone Node/TypeScript data tooling for historical backfills, repair jobs,
bulk sheet maintenance, and parity checks.

This package is intentionally separate from the Next.js app and from
`apps-script/`.

- `scripts/` is the canonical implementation for retrospective workflows.
- `apps-script/` remains focused on current-season operational updates.
- Overlapping formulas and serialization behavior should be kept aligned across
  both runtimes.

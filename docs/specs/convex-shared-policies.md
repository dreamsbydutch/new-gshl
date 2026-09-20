# Convex shared read, lineup, and publication policies

Implement architecture-review items 3, 4, and 5 on one branch, stacked on the
managed-job and contract-signing changes in PR #13. Preserve existing public
interfaces and authorization. No production deployment or data migration is
part of this work.

## Task graph

The three implementation tickets are independent. Integration depends on all
three; standards/spec review and final verification depend on integration.

### T3: Unify compatibility-read semantics

Concentrate safe index planning, residual compatibility filtering, ordering,
and limits behind one read module used by browser and operator adapters.
Mixed number/string fields and legacy timestamp values must not be discarded
by unsafe exact-index constraints before compatibility filtering can run.
Preserve operator-only tables, award translation, browser privacy, response
shapes, and purpose-built bounded reads. Test complete reads through the
adapters, including safe compound prefixes and filtering before limits.

### T4: Resolve the two lineup implementations

Use one lineup module with explicit draft and signing policies. Preserve the
draft roster union (owner, team, explicit players) and position-only writes;
preserve signing's active owner roster and team-plus-position writes. Share
normalization and assignment orchestration where policies agree, and make any
intentional rating or position conversion differences explicit. Cover
conflicting membership, inactive players, newly drafted players, null ratings,
and undo. Preserve the existing assignment algorithm and operator behavior.

### T5: Concentrate weekly-edition publication rules

Concentrate validation, editorial protection, revision creation, and persistence
across weekly templates, milestones, AI finalization, and manual editing.
Preserve authorization, AI commissioner revalidation, fact integrity, concurrent
edit protection, and intentional milestone versus weekly refresh behavior.
Keep fact gathering and external writing outside the publication module. Test
unchanged facts, protected content, revisions, stale AI writes, and milestone
refresh through the publication interface and its real callers.

## Verification and exclusions

Run focused handler/module tests, lint changed lintable files, and type-check
the affected Convex contracts. Regenerate bindings rather than editing them.
Review standards and spec independently, fix findings, and verify the exact
pushed commit's Vercel preview before marking the PR ready. Memory-intensive
checks run serially. In-memory handler tests are not proof of Convex runtime
concurrency or rollback.

Do not redesign league ownership rules, optimize broad historical reads as an
unmeasured side effect, change ranking algorithms, deploy Convex, or modify
production data. Existing unrelated workspace changes remain untouched.

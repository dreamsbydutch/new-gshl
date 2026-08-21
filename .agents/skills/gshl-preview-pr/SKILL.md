---
name: gshl-preview-pr
description: >-
  Publish only the current agent's completed-goal changes as a reviewable
  GitHub and Vercel handoff. Use when the user explicitly asks to turn current
  changes into a preview/* branch, thoughtful logical commits, a pushed GitHub
  branch, a Vercel preview, and an informative pull request with the direct
  preview URL, or asks to publish a completed goal as a preview PR. Do not use
  for a local commit only, PR review, merge, production promotion, or unrelated
  dirty-worktree cleanup.
metadata:
  short-description: Publish completed agent work as a Vercel preview PR
---

# GSHL preview pull request

Read [AGENTS.md](../../../AGENTS.md) before publishing. Treat this skill and its
[GitHub/Vercel lookup reference](references/github-vercel.md) as the complete
publication procedure; do not assume a separate documentation or verification
change is part of the branch.

The required outcome is one `preview/<goal-slug>` branch containing only the
current agent's completed work, a small set of coherent commits, a successful
Vercel deployment for the exact pushed HEAD, and one GitHub PR whose body links
directly to that deployment.

## Authorization and completion gate

A completed implementation goal does not authorize a push. Proceed through the
remote steps only when the user explicitly requests this publish/preview/PR
flow. That request authorizes creating the preview branch, pushing it to the
confirmed `origin`, triggering its preview deployment, and creating or updating
the PR. It does not authorize merging, force-pushing, promoting to production,
changing GitHub/Vercel settings, or deleting branches.

Identify the implementation objective from the completed goal or same-session
task history. The publication flow may itself be the active goal, but the work
being published must already be genuinely complete and verified. If a
different agent/session cannot reliably identify the work it owns, require an
explicit base and path/hunk manifest before continuing.

## 1. Establish ownership and base

Before mutating Git state, record:

- `git status --short`, the current branch, `HEAD`, its upstream, and `origin`;
- the repository default branch from `gh repo view`;
- the completed goal statement and the files/hunks changed by this agent; and
- existing commit conventions from repository policy and recent history.

Inspect the index separately with `git diff --cached`. It must be empty or
fully attributable to this agent and goal. If it contains unknown or
user-owned work, stop; do not unstage, overwrite, or inherit it.

Classify every dirty path as agent-owned, pre-existing/user-owned, or mixed.
Use the session's edit history and focused diffs; a dirty file is not proof of
ownership. Never stage an unknown path. Never use `git add .`, `git add -A`,
`git commit -a`, stash, clean, reset, checkout-discard, or another operation
that could capture or remove someone else's work. Stage explicit paths, and
use reviewed patch staging for mixed files. If ownership cannot be separated,
stop before creating commits and ask for the missing scope.

Exclude credentials, environment files, reports with authenticated content,
raw browser captures, `.local-data/`, `.vercel/`, archives, and other local
artifacts even if they are untracked.

Verify dependency closure against the prospective branch, not the mixed
working tree. Every documented command, linked file, generated binding, import,
schema/API dependency, and test fixture needed by the agent-owned patch must
already exist in the base or be agent-owned. If the patch works only because of
someone else's uncommitted changes, stop until those dependencies land on the
base or revise the patch; never absorb them merely to make the PR self-contained.
Use a temporary worktree from the base plus only the owned patch when the live
working tree cannot prove this cleanly.

If other agents are still editing the shared worktree, wait for them to finish
before switching its branch. Use an isolated worktree only when the owned patch
can be transferred without including another agent's state.

Choose the intended PR base before creating the branch. Default to the branch
that was checked out when the goal began when it is the actual integration
base; otherwise use the repository default only when its ancestry is correct.
Fetch `origin` and verify the recorded base commit is an ancestor of the remote
base. Do not silently rebase or fold unrelated existing commits into the PR.

## 2. Create the preview branch

Derive a short lowercase kebab-case slug from the completed goal's outcome, not
from a generic word such as `changes` or `agent-work`. Use
`preview/<goal-slug>`, validate it with `git check-ref-format --branch`, and
check both local and remote refs. If it exists, inspect its base, commits, and
associated PR. Resume it only when it is demonstrably the same goal and has no
unexpected divergence. Otherwise add a small numeric suffix. Never overwrite
or force-update an existing preview branch.

Create the branch from the recorded base `HEAD`. Unrelated dirty work may remain
in the working tree, but it must never enter a commit or the pushed diff.

## 3. Build logical commits

Inspect the full agent-owned diff and write the commit plan before staging.
Group by reviewable outcome and dependency, not mechanically by file type:

- keep an implementation with its focused tests;
- keep a manifest with its generated lockfile;
- keep authoritative runtime changes with synchronized copies;
- keep schema/API changes in a compatible order; and
- separate documentation or operational guidance only when it is an
  independently understandable change.

Follow the repository's dominant recent subject style. When no enforced style
exists, use an imperative, outcome-first subject of roughly 72 characters or
less; add a body when the reason, migration, risk, or verification is not
obvious. Avoid `WIP`, vague subjects, fake issue references, and arbitrary
commit counts.

For every commit:

1. stage only the planned explicit paths or hunks;
2. inspect `git diff --cached --name-status` and the complete cached diff;
3. run `git diff --cached --check` and scan for secrets/artifacts;
4. commit without bypassing hooks; and
5. confirm the remaining staged and unstaged changes still have the expected
   ownership.

After the final commit, compare `BASE_SHA...HEAD` and its file list with the
ownership manifest. It must contain every intended change and no pre-existing
or user-owned change. Unrelated local modifications may remain uncommitted.

## 4. Verify the exact pushed tree

Use the repository's verification policy to select the smallest checks that
exercise the committed change, and retain their exact commands and results for
the PR. Always inspect `git diff --check` and the focused branch diff. For
Markdown, run an explicit formatter check over the changed Markdown paths and
verify their relative links. When unrelated dirty files could influence a
check, run it from a temporary clean worktree at `HEAD` or state precisely why
the result still represents the committed tree. Do not claim a check covers
the preview branch when it ran against materially different local files.

Do not push a known-broken branch as ready for review. If the user explicitly
wants a failing diagnostic PR, make it a draft and disclose every failure.

## 5. Push and resolve the Vercel preview

Reconfirm `gh auth status`, the `origin` URL, branch name, commit list, and HEAD.
Push with upstream tracking and without force:

```text
git push --set-upstream origin preview/<goal-slug>
```

This repository's GitHub integration triggers Vercel from the branch push. Do
not run `vercel deploy`, guess a branch URL, or change Vercel configuration.

Resolve the repository name with `gh repo view`, capture the pushed HEAD SHA,
and poll GitHub's deployments endpoint using the exact `sha` filter. Select the
newest deployment created by `vercel[bot]`, then poll its statuses. Accept only
a `success` status in Vercel's `Preview` environment, or another environment
already confirmed as this repository's preview environment, with a non-empty
`environment_url` or `target_url`; that is the direct preview link. Reconfirm
the remote branch still points to the same SHA before using it. Use the exact
read-only API recipe in
[GitHub/Vercel preview lookup](references/github-vercel.md).

Poll for at most 15 minutes, with concise progress updates at least once per
minute. Stop immediately on `error` or `failure` and report the deployment's
description/log URL. A missing or protected preview is not permission to
invent a URL, invoke a second deployment path, or use a production deployment.

## 6. Create the informative PR

Check whether the head branch already has a PR. Update that PR rather than
creating a duplicate. Otherwise create one with explicit `--base` and `--head`
arguments and a reviewed `--body-file` to avoid shell-escaping damage.

Use a result-oriented title. The body must contain:

1. **Summary** - the completed goal and user-visible/operational outcomes.
2. **Preview** - a Markdown link labeled `Open the Vercel preview` whose
   destination is the direct deployment URL, near the top, plus the exact short
   commit SHA.
3. **Changes** - the logical commit/change groups and important boundaries.
4. **Verification** - exact checks and results, plus checks not run and why.
5. **Risk and review notes** - migrations, generated files, known limitations,
   rollout concerns, or intentionally excluded scope.

Do not include secrets, local absolute paths, raw authenticated output, or
claims unsupported by the diff. Create a draft only for an explicitly accepted
failure or unresolved review condition; otherwise create a normal PR after the
preview succeeds.

Finally, inspect the PR through `gh pr view` and verify its base/head, title,
body, direct preview link, and URL. Report the preview branch, commit hashes and
subjects, PR URL, Vercel URL, verification results, and any unrelated local
changes that remain uncommitted. Never merge the PR as part of this skill.

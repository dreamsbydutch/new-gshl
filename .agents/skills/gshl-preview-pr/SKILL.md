---
name: gshl-preview-pr
description: >-
  Publish completed work as an isolated preview/* branch, Vercel preview, and
  GitHub pull request. Use only when the user explicitly requests this complete
  preview-PR handoff.
metadata:
  short-description: Publish completed work as a preview PR
---

# GSHL preview pull request

The outcome is one `preview/<goal-slug>` branch containing only the current
task's completed work, coherent commits, a successful Vercel preview for the
exact pushed HEAD, and a PR that links to it. The request authorizes this flow;
it does not authorize force-push, merge, production promotion, settings changes,
or branch deletion.

## 1. Prove ownership and base

Record the current branch, `HEAD`, upstream, `origin`, default branch, status,
and staged diff. Classify every dirty path or hunk as task-owned, pre-existing,
or mixed. A dirty path is not proof of ownership.

Stage only explicit reviewed paths or hunks. Keep credentials, environment
files, authenticated captures, `.local-data`, `.vercel`, archives, and unrelated
work out. If ownership or dependency closure cannot be proven, stop before
committing and ask for the missing scope.

Choose the actual integration base, fetch `origin`, and verify ancestry. When a
mixed working tree could affect verification or dependency analysis, use a
temporary worktree containing the base plus only the owned patch.

## 2. Create the branch and commits

Create a valid, unused `preview/<outcome-slug>` from the recorded base. Resume
an existing branch only when its base, commits, and PR prove it is the same
task. Never overwrite or force-update it.

Plan commits by reviewable outcome and dependency. Keep implementation with its
tests, manifests with generated lockfiles, and authoritative runtime changes
with synchronized copies. For every commit:

1. stage explicit paths or reviewed hunks;
2. inspect the full staged diff and `git diff --cached --check`;
3. scan for secrets and artifacts;
4. commit without bypassing hooks; and
5. confirm remaining changes retain their expected ownership.

Compare the final `BASE...HEAD` file list and diff with the task manifest. It
must contain every intended change and nothing else.

## 3. Verify and push

Run change-sized checks against the exact committed tree. Preserve commands and
results for the PR; use a clean worktree when unrelated local files could alter
them. A known failure may be published only when the user explicitly wants a
diagnostic draft PR.

Reconfirm GitHub authentication, repository, branch, commits, and HEAD. Push
without force:

```text
git push --set-upstream origin preview/<goal-slug>
```

The repository's GitHub integration creates the Vercel deployment. Do not run a
second deploy command or invent a preview URL.

## 4. Resolve the preview and create the PR

Use the exact-SHA procedure in
[GitHub/Vercel preview lookup](references/github-vercel.md). Accept only a
successful preview deployment whose remote branch still points to the queried
SHA. Poll for at most 15 minutes, report progress at least once per minute, and
stop on a terminal failure.

Update an existing PR for the branch or create one with explicit base and head.
Its body contains:

- outcome summary;
- direct preview link and short commit SHA;
- logical change groups;
- exact verification results and omitted checks; and
- migrations, generated files, risks, limitations, and excluded scope.

Inspect the final PR's base, head, title, body, preview link, and URL. Register
the PR with the current T3 Code thread when that tool is available. Report the
branch, commits, PR, preview, checks, and unrelated local changes left behind.
Never merge as part of this skill.

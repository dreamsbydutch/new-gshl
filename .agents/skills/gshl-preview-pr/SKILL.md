---
name: gshl-preview-pr
description: >-
  Publish the current agent's completed GSHL change as an isolated preview
  branch, coherent commits, an exact-HEAD Vercel preview, and a GitHub pull
  request. Use only when the user explicitly asks for this complete handoff.
metadata:
  short-description: Publish completed agent work as a Vercel preview PR
---

# GSHL preview pull request

The outcome is one `preview/<goal-slug>` branch containing only the completed
goal, a successful Vercel preview for its exact HEAD, and one reviewable PR that
links to that preview. This workflow publishes; it never merges or promotes to
production.

The user's explicit request for this workflow authorizes branch creation, a
non-force push to the confirmed `origin`, waiting for the connected preview,
and creating or updating the PR. It does not authorize incorporating unrelated
work, changing repository/deployment settings, merging, force-pushing, or
deleting branches.

## 1. Prove the publish set

Record the current branch, HEAD, upstream, `origin`, default branch, index, and
working-tree status. Define the completed objective and an ownership manifest
of paths or hunks changed for that objective.

Classify every dirty path as goal-owned, pre-existing/user-owned, or mixed.
Use session edit history and focused diffs; dirtiness alone is not ownership.
The index must be empty or contain only reviewed goal-owned work. If an unknown
staged change exists, or a mixed hunk cannot be separated safely, stop and ask
for the missing ownership decision.

Check dependency closure against the intended base: imports, generated files,
fixtures, docs links, and package changes required by the patch must already be
in the base or in the ownership manifest. When the mixed working tree obscures
that proof, verify from a temporary worktree containing the base plus only the
owned patch. Leave unrelated changes untouched.

Choose and record the PR base. Prefer the goal's starting branch when it is the
actual integration base; otherwise use the repository default only after
checking ancestry. Fetch `origin` and stop if the proposed base would include
unrelated commits or require an unrequested rebase.

## 2. Build the branch and commits

Create a short `preview/<goal-slug>` name derived from the outcome. Validate the
ref and inspect matching local/remote branches and PRs. Resume an existing name
only when its base, commits, and PR prove it belongs to this same goal without
unexpected divergence; otherwise use a numeric suffix.

Write a commit plan before staging. Group implementation with its focused tests
and group generated or synchronized files with their source. Separate a docs or
operations change only when it is independently reviewable.

For each commit:

1. stage explicit goal-owned paths, or reviewed hunks for mixed files;
2. inspect the complete cached diff and name-status;
3. run `git diff --cached --check` and scan for secrets/local artifacts;
4. commit without bypassing hooks; and
5. recheck ownership of everything still staged and unstaged.

Use the repository's recent subject style. Prefer an imperative, outcome-first
subject when no convention is evident. Never stage broadly or alter unrelated
work to make the branch clean.

The branch is ready only when `BASE...HEAD` exactly matches the ownership
manifest and contains no credentials, environment values, authenticated
captures, `.local-data`, `.vercel`, archives, or other local artifacts.

## 3. Verify the committed tree

Use the [verification guide](../../../docs/operations/verification.md) to run
checks that exercise the committed change. Always inspect the focused branch
diff and `git diff --check`; check changed Markdown explicitly. If unrelated
working-tree files can affect a result, run the check from a clean temporary
worktree at HEAD.

Retain the exact commands, working directories, and results for the PR. Stop
before publishing a known-broken branch unless the user explicitly requested a
diagnostic PR; in that case use a draft and disclose every failure.

## 4. Push and resolve the exact preview

Reconfirm GitHub authentication, repository identity, branch name, commits, and
HEAD. Push once with upstream tracking and no force:

```text
git push --set-upstream origin preview/<goal-slug>
```

The GitHub integration creates the Vercel preview. Do not invoke a second
deployment path or guess a URL. Follow the exact-SHA polling procedure in
[GitHub/Vercel preview lookup](references/github-vercel.md). Stop on failure or
after its time limit and report the returned diagnostic. Before accepting the
URL, prove the remote branch still points to the SHA used for the deployment.

## 5. Create and inspect the PR

Update the existing PR for this head branch or create one with explicit base and
head arguments. Use a reviewed body file so shell escaping cannot corrupt it.
The body must contain:

- outcome-focused summary;
- `Open the Vercel preview` linking to the successful direct URL, plus short SHA;
- logical changes and important boundaries;
- exact verification results and checks not run; and
- risks, migrations, generated files, limitations, and excluded scope.

Create a normal PR unless an explicitly accepted failure requires a draft.
Inspect the resulting PR and verify base, head, title, body, preview link, and
URL.

## Completion gate

Report the branch, commit hashes and subjects, PR URL, direct Vercel URL,
verification results, and unrelated local changes left uncommitted. Completion
requires the remote branch SHA, successful deployment SHA, and PR head SHA to
match exactly.

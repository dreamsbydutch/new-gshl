# GitHub/Vercel preview lookup

Read this reference only after the preview branch has been pushed. These calls
read GitHub state; they do not create a second deployment.

## Preconditions

Confirm all of these before polling:

- the current branch begins with `preview/` and is not the PR base/default
  branch;
- `git rev-parse HEAD` is the SHA that `git push` reported;
- `git ls-remote origin refs/heads/<branch>` returns that same SHA; and
- `gh repo view` and `git remote get-url origin` identify the same repository.

Do not use a deployment found for another SHA or branch.

## Query the exact commit

PowerShell shape:

```powershell
$repository = gh repo view --json nameWithOwner --jq .nameWithOwner
$headSha = git rev-parse HEAD
$deploymentsJson = gh api --method GET "repos/$repository/deployments" -f "sha=$headSha" -f per_page=100
$deployments = $deploymentsJson | ConvertFrom-Json
$deployment = $deployments |
  Where-Object { $_.creator.login -eq "vercel[bot]" -and $_.sha -eq $headSha } |
  Sort-Object { [datetime]$_.created_at } -Descending |
  Select-Object -First 1
```

An empty result means Vercel has not registered the deployment yet. Poll every
15 seconds for up to 15 minutes. Emit a concise progress update at least every
minute; do not start another deployment while waiting.

Accept `Preview`, or another environment name already confirmed in repository
operations as the preview environment. Reject an unknown environment,
`Production`, the base branch, or a recorded SHA that differs from the pushed
HEAD. The repository's main-branch production deployment is not a preview
fallback.

## Read deployment status and URL

After a matching deployment appears:

```powershell
$statusesJson = gh api "repos/$repository/deployments/$($deployment.id)/statuses?per_page=100"
$status = ($statusesJson | ConvertFrom-Json) |
  Sort-Object { [datetime]$_.created_at } -Descending |
  Select-Object -First 1
```

Handle the newest state:

- `queued`, `pending`, or `in_progress`: keep polling.
- `success`: use `environment_url`. Fall back to `target_url` only when the
  first value is empty and the target is the deployed application itself, not
  a dashboard, check, or log page.
- `error` or `failure`: stop and report `description`, `log_url`, and
  `target_url` without presenting them as a preview.
- `inactive`: stop; the deployment is no longer a usable preview.

The accepted URL must be an absolute HTTPS URL returned by the successful
status. It may use `vercel.app` or a configured preview suffix, so do not
construct or rewrite it. Deployment protection may require an authenticated
viewer; a protected response does not make a different production URL an
acceptable substitute.

Before creating the PR, query the remote branch again and ensure it still
points to `$headSha`. If HEAD changed, discard the stale URL and repeat the
lookup for the new pushed SHA.

# Security Policy

## Supported versions

The `v1` tag (latest minor of the v1 line) receives security fixes.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** on this repository
(Report a vulnerability → Security tab). If it is unavailable, open a regular
issue prefixed `[security]` and we will take the discussion private immediately.

Do not open public PRs that expose a vulnerability before it is fixed.

## What this tool touches (threat surface, be specific)

costgrep runs **on your infrastructure** (your Actions runner or your terminal)
and makes outbound calls **only** to `api.github.com`:

- `GET /repos/{repo}/actions/runs` and `GET /repos/{repo}/actions/runs/{id}/jobs`
  — workflow-run and job **metadata** (actors, timestamps, labels, conclusions);
- `GET /repos/{repo}` — repository visibility (public/private), nothing else.

Environment variables it reads: `GITHUB_TOKEN`, `GITHUB_REPOSITORY`,
`GITHUB_REF` (resolve `--pr-comment auto`), `GITHUB_STEP_SUMMARY` (append the
Markdown report), and `COSTGREP_NO_WAIT` (skip the rate-limit retry sleep).
No others.

**The one write call:** everything above is read-only. The single exception is
`--pr-comment`, which you must pass explicitly — it POSTs the Markdown report
to `POST /repos/{repo}/issues/{pr}/comments` and nothing else.

It never reads: repository code, job logs, step output, secrets, or any billing
endpoint (those need org-admin rights this tool does not ask for).

The GitHub token you pass is used solely in the `Authorization` header of those
GET requests. It is never logged, stored, or transmitted anywhere else. The
CLI is a single zero-dependency file — audit it in one read; there is no
postinstall, no network library, no telemetry.

If your threat model requires it: run with a fine-grained PAT limited to
`actions:read` on a single repository, or inspect the traffic — every request
goes to `api.github.com` over HTTPS and nothing else.

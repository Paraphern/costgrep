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
and talks **only** to `api.github.com` (read-only by default — the two opt-in
write flags and the read-only billing subcommands are spelled out below):

- `GET /repos/{repo}/actions/runs` and `GET /repos/{repo}/actions/runs/{id}/jobs`
  — workflow-run and job **metadata** (actors, timestamps, labels, conclusions);
- `GET /repos/{repo}` — repository visibility (public/private), nothing else.

Environment variables it reads: `GITHUB_TOKEN`, `GITHUB_REPOSITORY`,
`GITHUB_REF` (resolve `--pr-comment auto`), `GITHUB_STEP_SUMMARY` (append the
Markdown report), `COSTGREP_NO_WAIT` (skip the rate-limit retry sleep),
`COSTGREP_TIMEOUT_MS` (per-request HTTP timeout, default 30000 — a hanging
server fails honestly instead of hanging the run), and `COSTGREP_API`
(base-URL override that exists **only** so verifiers can point the CLI at a
local mock — never needed in normal use). No others.

**The two explicit write calls:** everything above is read-only. Exceptions,
both opt-in flags you must pass yourself:
- `--pr-comment` — POSTs the Markdown report to `POST /repos/{repo}/issues/{pr}/comments`;
- `--slack-webhook URL` — POSTs `{"text": ...}` to the Slack incoming webhook you
  provide (URL validated to be `https://hooks.slack.com/services/...`).

**Billing endpoints (explicit subcommands only):** `reconcile` and `credits`
additionally read `GET /organizations/{org}/settings/billing/usage` and
`GET /organizations/{org}/settings/billing/ai_credit/usage` — the only places
that need an org token with billing rights. They are never called by the
default report, the composite action, or the fixture mode.

It never reads: repository code, job logs, step output, or secrets — under any
flag. (Billing endpoints are read by the explicit `reconcile`/`credits`
subcommands only, with a token you pass for that purpose.)

The GitHub token you pass is used solely in the `Authorization` header of the
requests above. It is never logged, stored, or transmitted anywhere else. The
CLI core is a single zero-dependency file (classifier lists live in a plain
`agents.json` next to it) — audit it in one read; there is no
postinstall, no network library, no telemetry.

If your threat model requires it: run with a fine-grained PAT limited to
`actions:read` on a single repository, or inspect the traffic — every GitHub
request goes to `api.github.com` over HTTPS; the only other outbound request
is the opt-in `--slack-webhook` POST you configure yourself.

# costgrep

**GitHub Actions cost breakdown by who triggered the run: human vs AI agent vs bot.**

Copilot coding agents, Copilot code review, Claude Code, Codex, Cursor — since June 2026
they all burn your Actions minutes *on top of* AI credits ([#192948], 958 downvotes).
GitHub's own usage views don't tell you **who** spent it. This does:

```
$ node scripts/costgrep.mjs --repo actions/stale --days 60
class      runs   run%    minutes       cost    cost%
agent         0   0.0%         0      $0.00    0.0%
human         2  25.0%         6      $0.16   54.5%
bot           6  75.0%        11      $0.13   45.5%
>>> Agents cost $0.00 (0.0% of CI spend, 0 runs / 0.0%).
>>> Bot runs: 6 (75.0% of all runs), bot spend $0.13.
>>> Top workflows by total cost: ...
```

Runs **on your infrastructure** (your Actions runner, your terminal). Zero npm
dependencies, one file, no telemetry, no code/log access — workflow-run metadata only.

## Quick start (composite action)

```yaml
# .github/workflows/agent-ci-audit.yml
name: costgrep audit
on:
  schedule: [{cron: '0 6 * * 1'}]   # weekly
  workflow_dispatch:
permissions:
  actions: read                     # the only permission needed
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # only so the JSON report lands in an artifact next to it
      - uses: YOUR_LOGIN/costgrep@v1
        with:
          days: '30'
      - uses: actions/upload-artifact@v4
        if: always()
        with: {name: costgrep, path: costgrep.json}
```

No org-admin rights, no billing access, no webhook — the repo-scoped
`GITHUB_TOKEN` with `actions: read` is enough.

## CLI

```bash
node scripts/costgrep.mjs --repo owner/name [--days 30] [--token $GITHUB_TOKEN] \
  [--max-runs 1000] [--config my-rules.json] [--json-file report.json] [--step-summary]
# offline demo on a bundled fixture:
node scripts/costgrep.mjs --fixture-dir test/fixtures/demo-repo --days 4000
```

`--config` (JSON) extends the classifier and overrides rates:

```json
{
  "agents": ["my-internal-agent-bot"],
  "bots":   ["my-ci-bot"],
  "rates":  { "actions_linux": 0.006 }
}
```

## How it attributes (public methodology — zero invented precision)

1. **Identity = `triggering_actor`**, falling back to `actor`. Re-runs are
   attributed to whoever re-ran them. For `workflow_run` chains `github.actor`
   can resolve to a generic bot ([gh-aw#20586]) — `triggering_actor` is the
   honest identity, so that's what we use.
2. **Classes:**
   - `agent` — login matches an AI-agent slug list (Copilot / `copilot-swe-agent`,
     Claude, Codex, Cursor, Gemini, Devin, Aider, Windsurf, CodeRabbit, Qodo, …
     full list in the source; extend via `--config`);
   - `bot` — automation (`github-actions[bot]`, Dependabot, Renovate, …) and any
     other `type: Bot` / `[bot]` account not claimed by the agent list;
   - `human` — `type: User`;
   - `unattributed` — anything we can't classify. We show the bucket; we never
     quietly re-assign it.
3. **Minutes:** `ceil((completed_at − started_at) / 60s)` per job, minimum 1 —
   same per-job round-up GitHub bills by. Jobs of the latest attempt only
   (the API default), so re-run attempts aren't double-counted. Queued/skipped
   jobs count 0; in-progress runs are excluded and reported.
4. **Rates:** the published GitHub-hosted runner list prices effective
   2026-01-01 ([docs]), keyed by the same SKU ids the billing API uses — the
   foundation for invoice reconciliation in the hosted phase. Self-hosted = $0
   (the $0.002/min platform fee was [postponed]); minutes still counted.
5. **Known limits (stated, not hidden):** list-price model — included plan
   minutes are consumed first, so this is *gross spend at list prices*, not
   your invoice; runner-class inference comes from job labels and falls back
   to the standard Linux rate (flagged in every report as `rate fallback` jobs);
   per-user AI *credits* are not visible at repo level (org billing API only —
   hosted phase). Expected accuracy vs a real invoice: **±5–10%**, which is
   exactly why the hosted product leads with reconciliation, not estimates.

## Why not just…?

| | actor/agent split | cost model | needs org admin |
|---|---|---|---|
| GitHub native usage views | ✗ (frozen since 21.07.2026, [#202838]) | invoice | — |
| Datadog CI Visibility | git-author only | per-committer $ | yes |
| Blacksmith Analytics | ✗ | minutes | no |
| TrimCI | bots excluded from *billing* | failure cost | no |
| **costgrep** | **human / agent / bot** | **list-price, reconciliation-ready** | **no** |

## Calibration case (do this first)

Run it on a repo where you can see the Actions usage chart for the same window:

1. `node scripts/costgrep.mjs --repo your-org/your-repo --days 30 --json-file r.json`
2. Compare `totalMinutes` per workflow against the GitHub UI "Usage" breakdown
   for the same 30 days (billable minutes, per-job rounded).
3. Compare per-class cost shares against what you *know* about the repo
   (scheduled jobs → bot; PRs from `copilot-swe-agent` → agent).
4. If your runners use unusual labels, add a `--config` rates block until
   `rate fallback jobs` hits zero.

## Roadmap

- **Phase B (hosted):** GitHub App + webhooks → org-wide dashboard, per-actor
  budgets/alerts, weekly digests.
- **Phase C (reconciliation):** nightly join against
  `/organizations/{org}/settings/billing/usage` — "our sum = your invoice line",
  residual shown as an honest `unattributed` bucket; AI credits per user next
  to minutes — the first unified agent bill.

## Privacy & license

The CLI reads workflow-run/job metadata via the public REST API and stores
nothing anywhere. MIT — see [LICENSE](LICENSE). Accuracy is best-effort; see
the methodology above before quoting numbers to your CFO.

[#192948]: https://github.com/orgs/community/discussions/192948
[gh-aw#20586]: https://github.com/github/gh-aw/issues/20586
[docs]: https://docs.github.com/en/billing/reference/actions-runner-pricing
[postponed]: https://github.com/resources/insights/2026-pricing-changes-for-github-actions
[#202838]: https://github.com/orgs/community/discussions/202838

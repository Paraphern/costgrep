# costgrep

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/costgrep-cli.svg)](https://www.npmjs.com/package/costgrep-cli)
[![test](https://github.com/Paraphern/costgrep/actions/workflows/test.yml/badge.svg)](https://github.com/Paraphern/costgrep/actions/workflows/test.yml)
[![self-audit](https://github.com/Paraphern/costgrep/actions/workflows/audit.yml/badge.svg)](https://github.com/Paraphern/costgrep/actions/workflows/audit.yml)

**GitHub Actions cost breakdown by who triggered the run: human vs AI agent vs bot.**

**See it on real data → [live benchmark, 6 public repos](benchmark/2026-10-02/README.md)**
and **[3 verifiable cases with links to the actual runs & PRs](benchmark/cases.md):**
in GitHub's own agentic-workflows repo, AI agents triggered **53.5% of runs and 28.8% of
CI spend in a single day**; a solo maintainer's repo is now **agent-majority (46% of runs,
57% of spend)**; in microsoft/vscode, **89% of a one-day sample's compute value ($123.61)
sits in runner classes GitHub bills even for public repos**.
Every figure ships with per-job evidence you can recompute in a spreadsheet.

Copilot coding agents, Copilot code review, Claude Code, Codex, Cursor — since June 2026
they all burn your Actions minutes *on top of* AI credits ([#192948], 958 downvotes).
GitHub's own usage views don't tell you **who** spent it. This does:

```
$ node scripts/costgrep.mjs --repo actions/stale --days 30 --max-runs 50 --quiet
costgrep — actions/stale (last 30 days, 50 runs, 47 jobs)
==============================================================================
class           runs   run%    minutes       cost    cost%
------------------------------------------------------------------------------
agent              0   0.0%         0      $0.00    0.0%
agent-assisted    14  28.0%        26      $0.28   36.8%
human             25  50.0%        24      $0.33   42.5%
bot               11  22.0%        16      $0.16   20.7%
unattributed       0   0.0%         0      $0.00    0.0%
------------------------------------------------------------------------------
total             50               66      $0.77

>>> Agents cost $0.00 (0.0% of CI spend, 0 runs / 0.0%).
>>> Bot runs: 11 (22.0% of all runs), bot spend $0.16.
>>> Top workflows by total cost:
         $0.50   65.0%  Basic validation
         $0.10   12.4%  Code scanning
         $0.06    7.8%  Licensed
>>> public repo: standard Linux/Windows minutes are FREE — the $ above is the list-price VALUE of this compute (what it would cost in a private repo), not money owed. NOTE: 5 macOS/larger-runner jobs ARE billed even for public repos (~$0.37).
>>> List-price model: NOT your invoice. Included plan minutes are consumed first; hosted phase reconciles against the billing API.
```

*(Real snapshot taken 2026-10-04 with the exact command shown; rerun it and you get
current numbers. Note the `agent-assisted` row: 14 of 50 runs in this repo were
pushed by humans with an AI `Co-Authored-By` trailer — that's the class doing its job.)*

Runs **on your infrastructure** (your Actions runner, your terminal). Zero npm
dependencies (single-file CLI core + a plain `agents.json` for the classifier
lists — the core works standalone if the data file is missing), no telemetry,
no code/log access — workflow-run metadata only.

## Install

```bash
npx costgrep-cli --repo owner/name          # one-shot
npm i -g costgrep-cli && costgrep --repo owner/name
```

The npm package is **`costgrep-cli`** (both binaries: `costgrep` and `costgrep-cli`).
Honest naming note: npm's typosquat filter blocks the plain name `costgrep` as
"too similar to `postgres`" (edit distance, really) — the repo, the GitHub action
and everything else stay `costgrep`.

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
      - uses: actions/checkout@v4   # only needed if you run a *local* copy / want the JSON in an artifact
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
  [--max-runs 1000] [--config my-rules.json] [--json-file report.json] \
  [--csv-file evidence.csv] [--md-file report.md] [--gh-output $GITHUB_OUTPUT] \
  [--no-coab] [--pr-comment N|auto] [--slack-webhook URL] [--step-summary] [--quiet] [--help]
# org-wide audit (still no org-admin rights — a PAT with actions:read is enough):
node scripts/costgrep.mjs --org my-org [--repos 20] [--max-runs 100]
# offline demo on a bundled fixture:
node scripts/costgrep.mjs --fixture-dir test/fixtures/demo-repo --days 4000
```

Requires Node >= 18 (`fetch`, `node:test`, ESM — no dependencies). Note on caps:
`--max-runs` defaults to **1000** in the CLI and **500** in the composite action
(safety cap for shared runners).

`--config` (JSON) extends the classifier and overrides rates:

```json
{
  "agents": ["my-internal-agent-bot"],
  "bots":   ["my-ci-bot"],
  "rates":  { "actions_linux": 0.006 }
}
```

## Outputs & budget gate

The action exposes machine-readable outputs, so CI can *act* on the split —
not just display it (per-actor budget enforcement GitHub's budgets API doesn't have):

```yaml
- id: costgrep
  uses: Paraphern/costgrep@v1
- name: Agent budget gate (fail when agents exceed 20% of CI spend)
  if: fromJSON(steps.costgrep.outputs['agent-share-pct']) > 20
  run: |
    echo "::error::AI agents burned ${{ steps.costgrep.outputs['agent-cost'] }} \
      (${{ steps.costgrep.outputs['agent-share-pct'] }}% of CI spend) — above the 20% budget"
    exit 1
```

| output | meaning |
|---|---|
| `total-cost` / `total-minutes` | whole-window list-price spend / billable minutes |
| `agent-cost` / `agent-share-pct` / `agent-runs` | the AI-agent slice |
| `agent-assisted-cost` | human-triggered runs with an AI `Co-Authored-By` trailer |
| `bot-runs` / `bot-runs-pct` | automation share of runs |

### Ready-made gates (copy-paste)

```yaml
# 1) Budget gate: fail CI when agents exceed 20% of spend
- id: costgrep
  uses: Paraphern/costgrep@v1
- run: |
    if (( $(echo "${{ steps.costgrep.outputs['agent-share-pct'] }} > 20" | bc -l) )); then
      echo "::error::Agents at ${{ steps.costgrep.outputs['agent-cost'] }} (${{ steps.costgrep.outputs['agent-share-pct'] }}%) — above budget"
      exit 1
    fi

# 2) Weekly org audit to Slack (secrets.SLACK_WEBHOOK; PAT with actions:read as CG_PAT)
- uses: Paraphern/costgrep@v1
  env:
    CG_TOKEN: ${{ secrets.CG_PAT }}
  with:
    token: ${{ secrets.CG_PAT }}
    slack-webhook: ${{ secrets.SLACK_WEBHOOK }}
    days: '7'
# (--org mode: run the CLI directly, see above)

# 3) Cost stamp on every PR (needs pull-requests:write)
- uses: Paraphern/costgrep@v1
  with:
    pr-comment: auto
```

## Reconciliation & AI credits (experimental subcommands)

For organizations that *can* provide an org token with billing rights (the one
place costgrep ever asks for more than `actions:read`):

```bash
# our recomputation vs the billing API, per SKU, for a calendar month;
# the delta lands in an explicit "unattributed" bucket with coverage warnings
node scripts/costgrep.mjs reconcile --org my-org --month 2026-09 --billing-token $ORG_TOKEN

# AI credits for the same month (by model; per-user breakdown is not exposed by the API)
node scripts/costgrep.mjs credits --org my-org --month 2026-09 --billing-token $ORG_TOKEN
```

**Status, stated plainly: EXPERIMENTAL.** This code path is not yet validated
against a live billing account — treat every delta as a hypothesis until
calibrated on a real invoice (that calibration program is the 1.0 gate). Every
output of these subcommands carries this label; the coverage warnings say
exactly which repos/runs the comparison did and did not see.

## Evidence: every number is traceable

Reports are self-describing — a human can check any figure against real API data:

- **JSON** (`--json-file`): aggregates + `provenance` (which endpoints were called, the
  exact window, fetched-vs-counted jobs, rates version, honesty flags) + `evidence[]` —
  one row per billable job.
- **CSV** (`--csv-file`): the same per-job rows for any spreadsheet: run, actor, class,
  timestamps, minutes, SKU, rate, cost.
- **Markdown** (`--md-file`): a shareable report with the provenance block baked in.

Verify it yourself (that's the point):

1. open the CSV and recompute `minutes × rate_usd_per_min` on any row — it matches `cost_usd`;
2. sum `cost_usd` — it equals the headline totals;
3. compare `minutes` against the GitHub usage UI for the same window (same per-job round-up);
4. rerun costgrep on the same repo + window — the result is deterministic (latest job attempt only);
5. spot-check any `run_id` via `gh api /repos/{repo}/actions/runs/{run_id}/jobs` — timestamps,
   actor and labels in the CSV are the API's own values, unmodified.

Scope note: the CSV proves the **spend and minutes** figures. The *run-share* percentages
(e.g. "agents = 53.5% of runs") count all runs in the window, including ones whose jobs
never started — those are visible in the JSON report's `runsAnalyzed`/class totals, and
re-derivable directly from `GET /repos/{repo}/actions/runs`.

## How it attributes (summary — full methodology: [docs/methodology.md](docs/methodology.md))

1. **Identity = `triggering_actor`**, falling back to `actor`. Re-runs are
   attributed to whoever re-ran them. For `workflow_run` chains `github.actor`
   can resolve to a generic bot ([gh-aw#20586]) — `triggering_actor` is the
   honest identity, so that's what we use.
2. **Classes:**
   - `agent` — login matches an AI-agent slug list (Copilot / `copilot-swe-agent`,
     Claude, Codex, Cursor, Gemini, Devin, Aider, Windsurf, CodeRabbit, Qodo, …
     the list lives in [`agents.json`](agents.json) — extend it by PR, no code);
   - `agent-assisted` — human-triggered run whose head commit carries an AI
     `Co-Authored-By:` trailer (checked from the run's own metadata, zero extra
     API calls; disable with `--no-coab`). Known limit, stated plainly: some
     editors (VS Code) auto-insert the Copilot trailer — that's why this is a
     separate class and never silently merged into `agent`;
   - `bot` — automation (`github-actions[bot]`, Dependabot, Renovate, …) and any
     other `type: Bot` / `[bot]` account not claimed by the agent list;
   - `human` — `type: User`;
   - `unattributed` — anything we can't classify. We show the bucket; we never
     quietly re-assign it.
3. **Minutes:** `ceil((completed_at − started_at) / 60s)` per job, minimum 1 —
   same per-job round-up GitHub bills by. Jobs of the latest attempt only
   (the API default), so re-run attempts aren't double-counted. Jobs that never
   reached a runner (no timestamps) count 0; in-progress runs are excluded and
   reported. Jobs that hold runner timestamps but were `skipped` or had
   zero/negative duration are billed at the 1-minute minimum and **flagged in
   every report with their exact total** — whether GitHub bills such executions
   identically is unverifiable without invoice access, so we surface the
   subtrahend instead of silently deciding.
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

## Why not just…? *(checked 2026-10)*

| tool | human/agent/bot split | cost numbers it gives you | what you pay | needs org admin |
|---|---|---|---|---|
| GitHub native usage views | ✗ — no actor slice; org metrics [frozen since 21.07.2026](https://github.com/orgs/community/discussions/202838) | invoice-grade billing view | included in plan | view perms on billing |
| Datadog CI Visibility | partial — git-author facet only, not trigger actor | span-based estimates | $8–12 / committer / mo | yes |
| Blacksmith Analytics | ✗ (jobs / workflows / repos) | runner minutes | bundled with runners | no |
| TrimCI | partial — bots excluded from *their* billing math; no AI-agent class | cost of CI failures | usage-based, per active contributor | no |
| **costgrep** | **✓ human / AI agent / bot, re-runs attributed** | **list-price per 2026 SKU rates (invoice reconciliation = planned hosted phase, not yet)** | **nothing — free, open source (Apache-2.0)** | **no — repo token, `actions:read`** |

**Money, stated plainly:** costgrep costs nothing and no paid tier exists today.
Every `$` figure it prints is the *list-price value of compute* (see the notice in
every report) — not money you owe GitHub and not money you pay us.

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

**This repo — the CLI and the composite action — is free and open source, permanently.**
If a paid product ever appears, it will be the *hosted service* (continuous monitoring,
invoice reconciliation), not this code.

**1.0 is criteria-based, not date-based** (see [CHANGELOG](CHANGELOG.md) and
[docs/calibration.md](docs/calibration.md)): accuracy demonstrated on ≥5 real
organizations with reconciliation delta ≤5%; 100+ action installs; zero open
doctrine violations under a repeatable verification pass. Current state:
**engineering-complete to 1.0-rc — the remaining gates are market evidence.**
Stability guarantees: [docs/compatibility.md](docs/compatibility.md).

- **Phase B (hosted):** GitHub App + webhooks → org-wide dashboard, per-actor
  budgets/alerts, weekly digests.
- **Phase C (reconciliation):** nightly join against
  `/organizations/{org}/settings/billing/usage` — "our sum = your invoice line",
  residual shown as an honest `unattributed` bucket; AI credits per user next
  to minutes — the first unified agent bill.

## Privacy & license

The CLI reads workflow-run/job metadata via the public REST API and stores
nothing anywhere. Apache-2.0 — see [LICENSE](LICENSE). Accuracy is best-effort; see
the methodology above before quoting numbers to your CFO.

[#192948]: https://github.com/orgs/community/discussions/192948
[gh-aw#20586]: https://github.com/github/gh-aw/issues/20586
[docs]: https://docs.github.com/en/billing/reference/actions-runner-pricing
[postponed]: https://github.com/resources/insights/2026-pricing-changes-for-github-actions
[#202838]: https://github.com/orgs/community/discussions/202838

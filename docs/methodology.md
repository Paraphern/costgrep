# Methodology

*This is the canonical methodology text. The README keeps a summary; when they
disagree, this file wins and the README gets fixed.*

## What costgrep measures

GitHub Actions usage **at list prices** broken down by who triggered each run:
`agent` / `agent-assisted` / `human` / `bot` / `unattributed`. It recomputes cost
from public API metadata; it does not read your invoice (the `reconcile`
subcommand compares the two — see status below).

## Attribution

- **Identity = `run.triggering_actor`**, falling back to `run.actor`. Re-runs are
  attributed to whoever re-ran them. For `workflow_run` chains `github.actor` can
  resolve to a generic bot ([gh-aw#20586](https://github.com/github/gh-aw/issues/20586));
  `triggering_actor` is the honest identity.
- **`agent`** — normalized login matches an AI-agent slug from
  [`agents.json`](../agents.json) (contains-match; extend by PR with cited evidence).
- **`agent-assisted`** — human-triggered run whose head commit message carries an
  AI `Co-Authored-By:` trailer matching a known agent name. Read from the run's own
  `head_commit` metadata (zero extra API calls). Known limit, stated plainly: some
  editors (VS Code) auto-insert the Copilot trailer, so this class can over-count;
  that is exactly why it is a *separate* class, never merged into `agent`.
  Disable with `--no-coab`.
- **`bot`** — automation accounts (`github-actions[bot]`, Dependabot, …) and any
  other `type: Bot` / `[bot]` login not claimed by the agent list.
- **`unattributed`** — anything unmatched. Shown, never silently re-assigned.

## Minutes and cost

- `minutes(job) = max(1, ceil((completed_at − started_at) / 60 s))` — the same
  per-job round-up GitHub bills by. Latest attempt per job only (API default),
  so re-run attempts are not double-counted.
- Jobs with no runner timestamps (never started) count 0. In-progress jobs are
  excluded and counted in `inProgressJobs`.
- **Jobs that hold runner timestamps but are `skipped` or zero/negative duration**
  are billed at the 1-minute minimum and reported separately with their exact
  total, because whether GitHub bills such executions identically is unverifiable
  without invoice access — we surface the subtrahend instead of silently deciding.
- Rates: GitHub-hosted list prices effective **2026-01-01** keyed by the same SKU
  ids the billing API uses (source linked in every report's provenance). Self-hosted
  = $0/min while the $0.002 platform fee is postponed (minutes still counted).
- Runner class is inferred from job `labels`; unrecognized labels fall back to the
  standard Linux rate **and are flagged** (`rate_fallback` in every evidence row).

## What the money figures mean

List-price value of the compute. For public repositories, standard Linux/Windows
hosted minutes are free — the tool says so in every report (macOS and larger
runners are the billed exception, also called out). For private repositories,
included plan minutes are consumed before anything is billed. **These figures are
not an invoice.** Expected accuracy vs a real invoice: ±5–10% — which is why the
product's north star is reconciliation, not estimation.

## Reconciliation (`reconcile` subcommand) — status

Compares our per-SKU recomputation against the enhanced billing platform usage
API for a calendar month. The delta lands in an explicit `unattributed` bucket
with coverage warnings (unscanned repos, run caps). **Status: EXPERIMENTAL —
not yet validated against a live billing account.** Until the calibration
program ([calibration.md](calibration.md)) closes on ≥5 real organizations,
treat every reconcile delta as a hypothesis.

## Determinism and evidence

Same repo + same window → same numbers (job data is immutable history). Every
report carries a provenance block (endpoints, window, counts, rates version,
honesty flags) and per-job `evidence[]` rows — recompute any aggregate in a
spreadsheet; the sums must match to the cent.

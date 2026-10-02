# costgrep live benchmark — 2026-10-02

*Tool: costgrep v0.2.0 (numbers are identical under v0.2.1, which only added the
public/private billing note). Method: GitHub REST API (runs + jobs metadata), attribution
via `triggering_actor`, list-price model (2026 rates, docs.github.com billing reference).
Sample = **last ≤200 runs per repo** — on busy repos that is roughly ONE day of traffic
(window shown per repo). Per-job evidence CSV and per-repo Markdown report for every repo
sit next to this file; full JSON regenerates with the command at the bottom.*

| repo | window (sample) | runs | minutes | list-price $ | agent share of $ (runs) | bot runs (share of $) |
|---|---|---|---|---|---|---|
| [github/gh-aw](https://github.com/github/gh-aw) | 02.10 (1 day) | 200 | 901 | $3.97 | **28.8%** (107 runs, 53.5%) | 5% (6%) |
| [vercel/next.js](https://github.com/vercel/next.js) | 02.10 (1 day) | 200 | 11,183 | $299.93 | 0.0% (2 runs, 1%) | 3% (20%) |
| [react](https://github.com/react/react) (facebook/react) | 30.09–02.10 | 200 | 2,238 | $13.43 | 0% (0) | 22% (48%) |
| [github/docs](https://github.com/github/docs) | 02.10 (1 day) | 200 | 470 | $2.82 | 0% (0) | 1% (0%) |
| [actions/stale](https://github.com/actions/stale) | 03–29.09 (30d) | 87 | 133 | $1.50 | 2.0% (1 run) | 36% (37%) |
| [Paraphern/rugsnare](https://github.com/Paraphern/rugsnare) | 29.09–02.10 | 132 | 711 | $5.11 | 0% (0) | 2% (1%) |

## Headline findings

1. **GitHub's own agentic-workflows repo (github/gh-aw) is agent-dominated:** 53.5% of runs
   and 28.8% of CI spend in a single day triggered by AI agents. Every agent run we checked
   was the `Copilot` actor (Copilot coding agent / code review), including a workflow
   literally named "Running Copilot Code Review".
2. **Bots can cost as much as humans:** in facebook/react, bots trigger 22% of runs but
   account for 48% of spend — automation is not free noise, it's half the bill.
3. **Scale check:** vercel/next.js burns ~$300 of list-price compute in ~200 runs of a
   single day (11k minutes) — one day, one repo, one team.

## Verification (how you can check every number here)

- **Invariant:** summing `cost_usd` and `minutes` across every row of each CSV equals the
  headline totals — verified for all 6 reports (to the cent and the minute).
- **Raw-API spot-check:** evidence row `run 36993383799 / job 110794484271` (gh-aw) says
  actor `Copilot`, 23 min, $0.1380. Raw API: `triggering_actor.login = "Copilot"`,
  job 10:04:11Z→10:26:54Z = 22m43s → rounds up to 23 min × $0.006 (ubuntu) = $0.1380. Match.
- Reproduce: `GITHUB_TOKEN=… node scripts/costgrep.mjs --repo github/gh-aw --days 1 --max-runs 200 --csv-file out.csv`

## Honest caveats (read before quoting)

- **List-price ≠ invoice.** These repos are public: standard-runner minutes for public
  repos are free. The $ column is the **list-price value of the compute** — what the same
  traffic would cost in a private repo (and what org-private traffic does cost). Included
  plan minutes on private repos are consumed before any billing.
- **Sample, not census:** 200-run cap means busy repos show ~1 day, quiet repos show the
  full 30 days (window listed per repo).
- **Rate-fallback bucket:** jobs whose API `labels` array is empty were priced at the
  standard Linux rate and flagged in each report (next.js: 50 of 1,840 jobs = 2.7%;
  react: 27 of 1,254 = 2.1%; gh-aw: 2; others: 0). Known limitation, stated in every report.
- **Logins:** the CSVs contain GitHub logins of users who triggered public workflow runs —
  public API metadata, quoted unmodified so every row stays verifiable. No private data
  was accessed or inferred.
- Attribution by `triggering_actor` + slug lists; humans remain humans, unknown accounts
  would land in `unattributed` (0 across this sample).

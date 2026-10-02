## 🤖 costgrep — github/gh-aw

**$1.15 from AI agents (28.8% of CI spend)** · bot runs: 10 (5.0%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 107 | 53.5% | 191 | $1.15 | 28.8% |
| human | 83 | 41.5% | 669 | $2.58 | 65.0% |
| bot | 10 | 5.0% | 41 | $0.25 | 6.2% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| CI | $0.26 | 6.6% |
| PR Sous Chef | $0.25 | 6.4% |
| Running Copilot Code Review | $0.24 | 6.0% |

### Where these numbers come from

- **Data:** GET /repos/github/gh-aw/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-10-02T09:03:50Z → 2026-10-02T10:52:24Z), 200 runs, 560 of 561 fetched jobs counted (1 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 2 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


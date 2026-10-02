## 🤖 costgrep — github/docs

**$0.00 from AI agents (0.0% of CI spend)** · bot runs: 1 (0.5%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 0 | 0.0% | 0 | $0.00 | 0.0% |
| human | 199 | 99.5% | 469 | $2.81 | 99.8% |
| bot | 1 | 0.5% | 1 | $0.01 | 0.2% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| Test | $1.28 | 45.5% |
| Headless Tests | $0.24 | 8.5% |
| Comment on adding "needs SME" label | $0.17 | 6.0% |

### Where these numbers come from

- **Data:** GET /repos/github/docs/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-10-02T04:05:14Z → 2026-10-02T10:13:00Z), 200 runs, 338 of 338 fetched jobs counted (0 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 0 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


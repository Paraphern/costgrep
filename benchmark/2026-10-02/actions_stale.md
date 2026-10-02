## 🤖 costgrep — actions/stale

**$0.03 from AI agents (2.0% of CI spend)** · bot runs: 31 (35.6%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 1 | 1.1% | 5 | $0.03 | 2.0% |
| human | 55 | 63.2% | 77 | $0.91 | 60.6% |
| bot | 31 | 35.6% | 51 | $0.56 | 37.4% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| Basic validation | $0.96 | 64.0% |
| Code scanning | $0.17 | 11.6% |
| Licensed | $0.12 | 8.0% |

### Where these numbers come from

- **Data:** GET /repos/actions/stale/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-09-03T00:37:20Z → 2026-09-29T14:16:51Z), 87 runs, 90 of 90 fetched jobs counted (0 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 0 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


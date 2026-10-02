## 🤖 costgrep — vercel/next.js

**$0.01 from AI agents (0.0% of CI spend)** · bot runs: 5 (2.5%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 2 | 1.0% | 2 | $0.01 | 0.0% |
| human | 193 | 96.5% | 8931 | $240.42 | 80.2% |
| bot | 5 | 2.5% | 2250 | $59.50 | 19.8% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| build-and-test | $273.04 | 91.0% |
| build-and-deploy | $25.16 | 8.4% |
| test-e2e-deploy repo version | $0.54 | 0.2% |

### Where these numbers come from

- **Data:** GET /repos/vercel/next.js/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-10-02T05:31:43Z → 2026-10-02T10:56:10Z), 200 runs, 1840 of 1869 fetched jobs counted (29 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 50 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


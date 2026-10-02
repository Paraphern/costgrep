## 🤖 costgrep — facebook/react

**$0.00 from AI agents (0.0% of CI spend)** · bot runs: 44 (22.0%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 0 | 0.0% | 0 | $0.00 | 0.0% |
| human | 156 | 78.0% | 1165 | $6.99 | 52.1% |
| bot | 44 | 22.0% | 1073 | $6.44 | 47.9% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| (Runtime) Build and Test | $10.74 | 80.0% |
| (Runtime) Fuzz tests | $0.44 | 3.3% |
| (Runtime) ESLint Plugin E2E | $0.32 | 2.4% |

### Where these numbers come from

- **Data:** GET /repos/facebook/react/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-09-30T19:11:35Z → 2026-10-02T10:16:25Z), 200 runs, 1254 of 1254 fetched jobs counted (0 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 27 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


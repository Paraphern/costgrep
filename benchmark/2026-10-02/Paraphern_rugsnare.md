## 🤖 costgrep — Paraphern/rugsnare

**$0.00 from AI agents (0.0% of CI spend)** · bot runs: 2 (1.5%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 0 | 0.0% | 0 | $0.00 | 0.0% |
| human | 130 | 98.5% | 700 | $5.04 | 98.7% |
| bot | 2 | 1.5% | 11 | $0.07 | 1.3% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| ci | $4.16 | 81.4% |
| Push on main | $0.68 | 13.4% |
| canary | $0.12 | 2.3% |

### Where these numbers come from

- **Data:** GET /repos/Paraphern/rugsnare/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-09-29T14:35:30Z → 2026-10-02T09:31:42Z), 132 runs, 674 of 674 fetched jobs counted (0 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 0 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


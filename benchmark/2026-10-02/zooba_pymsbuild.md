## 🤖 costgrep — zooba/pymsbuild

**$0.07 from AI agents (1.3% of CI spend)** · bot runs: 1 (4.0%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 7 | 28.0% | 12 | $0.07 | 1.3% |
| human | 17 | 68.0% | 624 | $5.38 | 98.6% |
| bot | 1 | 4.0% | 1 | $0.01 | 0.1% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| Test | $5.38 | 98.5% |
| Running Copilot cloud agent | $0.07 | 1.3% |
| PyPI Release | $0.01 | 0.1% |

### Where these numbers come from

- **Repo visibility:** public — standard Linux/Windows hosted minutes are **free** for public repositories; the $ figures are the list-price value of this compute, not money owed.
- **Data:** GET /repos/zooba/pymsbuild/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-09-10T19:43:50Z → 2026-10-02T11:36:05Z), 25 runs, 196 of 196 fetched jobs counted (0 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 0 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


## 🤖 costgrep — Otisigma/halo-world-global-platform

**$1.28 from AI agents (56.9% of CI spend)** · bot runs: 10 (5.0%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 92 | 46.0% | 214 | $1.28 | 56.9% |
| human | 98 | 49.0% | 147 | $0.88 | 39.1% |
| bot | 10 | 5.0% | 15 | $0.09 | 4.0% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| Running Copilot cloud agent | $1.25 | 55.3% |
| CI | $0.65 | 28.7% |
| Telemetry artifact and optional Netlify deploy | $0.32 | 14.4% |

### Where these numbers come from

- **Repo visibility:** public — standard Linux/Windows hosted minutes are **free** for public repositories; the $ figures are the list-price value of this compute, not money owed.
- **Data:** GET /repos/Otisigma/halo-world-global-platform/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-09-30T00:37:28Z → 2026-10-02T11:38:18Z), 200 runs, 199 of 202 fetched jobs counted (3 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 0 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


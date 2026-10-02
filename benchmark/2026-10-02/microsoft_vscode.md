## 🤖 costgrep — microsoft/vscode

**$0.58 from AI agents (0.4% of CI spend)** · bot runs: 6 (3.0%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
| agent | 15 | 7.5% | 96 | $0.58 | 0.4% |
| human | 179 | 89.5% | 5477 | $130.09 | 93.5% |
| bot | 6 | 3.0% | 389 | $8.41 | 6.0% |
| unattributed | 0 | 0.0% | 0 | $0.00 | 0.0% |

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
| Code OSS | $127.13 | 91.4% |
| chat-lib tests | $4.95 | 3.6% |
| CodeQL | $2.54 | 1.8% |

### Where these numbers come from

- **Repo visibility:** public — standard Linux/Windows hosted minutes are **free** for public repositories; the $ figures are the list-price value of this compute, not money owed. Exception: 127 macOS/larger-runner jobs are billed even for public repos (~$123.61).
- **Data:** GET /repos/microsoft/vscode/actions/runs (workflow-run metadata); GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job). repository code, logs, secrets — workflow metadata only.
- **Window:** last 30 days (2026-10-02T09:00:29Z → 2026-10-02T11:40:58Z), 200 runs, 703 of 773 fetched jobs counted (70 in-progress excluded).
- **Attribution:** run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed.
- **Rates:** GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing. Self-hosted: $0/min while the $0.002 platform fee is postponed; minutes still counted.
- **Honesty flags:** 14 jobs on the rate fallback (unknown runner labels → standard Linux rate); unattributed: 0 runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: same repo + window -> same numbers. Verify any number against the per-job `evidence[]` in the JSON / CSV export. Full methodology: README._


# Three verifiable cases — real repos, real links, real numbers

*Generated with costgrep v0.2.1 on 2026-10-02. Every case lists: the story, the numbers,
**links to the actual PRs and workflow runs**, and the one command to reproduce.
Sample = last ≤200 runs per repo (busy repos ≈ one day of traffic; window stated per case).
List-price model — what this compute costs at GitHub's 2026 price list (see caveats in
[the benchmark](2026-10-02/README.md)). Evidence CSV per repo sits next to this file.*

---

## Case 1 — GitHub's own repo: agents are already the majority CI user

**Repo:** [github/gh-aw](https://github.com/github/gh-aw) — GitHub's product repo for
Agentic Workflows. **Window:** 200 runs on 2026-10-02 (one day).

| who triggers CI | runs | share of runs | share of spend |
|---|---|---|---|
| AI agents (Copilot) | 107 | **53.5%** | **28.8%** ($1.15 of $3.97) |
| humans | 83 | 41.5% | 65.2% |
| bots | 10 | 5.0% | 6.0% |

**See it yourself:**
- Agent run (raw check): [actions/runs/36993383799](https://github.com/github/gh-aw/actions/runs/36993383799)
  — workflow *"Addressing comment on PR #64994"*, `triggering_actor: Copilot`, job
  22m43s → 23 billable min × $0.006 = $0.1380 (matches our CSV row exactly).
- The PR the agent was fixing: [gh-aw#64994](https://github.com/github/gh-aw/pull/64994).
- A whole agent-driven workflow: ["Running Copilot Code Review"](https://github.com/github/gh-aw/actions/workflows) in the repo's Actions tab.

**Reproduce:**
```bash
node scripts/costgrep.mjs --repo github/gh-aw --days 1 --max-runs 200 --csv-file gh-aw.csv
```

---

## Case 2 — An indie developer whose CI is now agent-majority

**Repo:** [Otisigma/halo-world-global-platform](https://github.com/Otisigma/halo-world-global-platform)
— a solo-maintained hobby project. **Window:** 200 runs, 2026-09-30 → 10-02.

| who triggers CI | runs | share of runs | share of spend |
|---|---|---|---|
| AI agents (Copilot) | 92 | **46.0%** | **56.9%** ($1.28 of $2.26) |
| humans | ~98 | 49.0% | 39% |
| bots | 10 | 5.0% | 4% |

Nearly half the pipeline runs and **more than half the compute value** in this repo is
triggered by a coding agent, not by the maintainer. The workflow is literally named
"Running Copilot cloud agent".

**See it yourself:**
- Agent runs: [actions/runs/37001448241](https://github.com/Otisigma/halo-world-global-platform/actions/runs/37001448241),
  [runs/36999980999](https://github.com/Otisigma/halo-world-global-platform/actions/runs/36999980999) —
  check the `triggering_actor` on the run page (Copilot).
- Agent-authored PRs: [#278](https://github.com/Otisigma/halo-world-global-platform/pull/278),
  [#277](https://github.com/Otisigma/halo-world-global-platform/pull/277),
  [#276](https://github.com/Otisigma/halo-world-global-platform/pull/276).

**Bonus — agents work in serious repos too:** [zooba/pymsbuild](https://github.com/zooba/pymsbuild)
(maintainer = a CPython core developer): 7 of 25 runs (28%) in the window triggered by
Copilot, incl. [PR #125 "Expose target Python and wheel-tag properties to MSBuild"](https://github.com/zooba/pymsbuild/pull/125).

**Reproduce:**
```bash
node scripts/costgrep.mjs --repo Otisigma/halo-world-global-platform --days 3 --max-runs 200
```

---

## Case 3 — "Public repo" ≠ "free CI": the macOS bill in microsoft/vscode

**Repo:** [microsoft/vscode](https://github.com/microsoft/vscode). **Window:** 200 runs
on 2026-10-02 (one day). List-price value of the sample: **$139.08**.

| runner class | jobs | minutes | list-price $ | billed on a public repo? |
|---|---|---|---|---|
| macOS 5-core M2 Pro (`macos_xl`) | 104 | 1,173 | **$119.65** | **YES** |
| macOS standard | 23 | 64 | $3.97 | **YES** |
| Linux standard | 306 | 2,460 | $14.76 | no (free for public repos) |
| Windows standard | 22 | 71 | $0.71 | no |
| self-hosted | 248 | 2,194 | $0.00 | n/a |

**89% of the compute value in this sample ($123.61) sits in runner classes GitHub bills
even for public repositories.** Public repos get Linux/Windows standard minutes free —
macOS (and larger) runners are the exception, and in macOS-heavy projects they *are* the bill.
This repo also shows 15 agent-triggered runs (7.5%) — agents and billed runners compound.

**See it yourself:** e.g. [actions/runs/37000636285](https://github.com/microsoft/vscode/actions/runs/37000636285)
("Code OSS", 12 min on a 5-core macOS runner — $1.22 at list price), or open any recent
run of the [Code OSS build workflow](https://github.com/microsoft/vscode/actions) and check the runner label.

**Reproduce:**
```bash
node scripts/costgrep.mjs --repo microsoft/vscode --days 1 --max-runs 200 --csv-file vscode.csv
```

---

### Why these numbers are trustworthy

1. Every repo has a per-job CSV next to this file — recompute `minutes × rate` in any
   spreadsheet; the sums equal the headline totals (verified to the cent).
2. The attribution column is the API's own `triggering_actor.login`, unmodified — click
   any run link above and compare.
3. Deterministic: same repo + window → same numbers. Rate table: GitHub's published 2026
   list prices (source linked in every report's provenance block).
4. Costgrep itself states the money caveats in every output: list-price vs invoice,
   public-repo freeness, rate-fallback jobs.

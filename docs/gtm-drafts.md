# Фаза A — GTM-заготовки (публикация руками владельца аккаунтов)

## Боеприпасы из кейсов (вставлять в посты ссылками)

Полная страница: `benchmark/cases.md` (в репо). Три кейса, каждый проверяем кликом:
1. **github/gh-aw** — у самого GitHub агенты = 53.5% ранов / 28.8% трат за день; пример рана: https://github.com/github/gh-aw/actions/runs/36993383799 (Copilot чинит PR #64994).
2. **Otisigma/halo-world** — соло-мейнтейнер: агенты = 46% ранов / 57% трат; живой воркфлоу "Running Copilot cloud agent": https://github.com/Otisigma/halo-world-global-platform/actions/runs/37001448241 (+ PRs #276–278).
3. **microsoft/vscode** — «публичный ≠ бесплатный»: 89% ценности дня ($123.61) — macOS-раннеры, платные даже для публичных репо: https://github.com/microsoft/vscode/actions/runs/37000636285

## Show HN (после публикации репо)

**Title:** Show HN: costgrep – GitHub Actions spend, split human vs AI agent vs bot

We kept getting the "why did our Actions bill jump?" question and GitHub's own usage
view can't answer *who* spent it — since June 2026 Copilot code review bills minutes
on top of AI credits, and agent PRs keep growing. So we built a zero-dependency CLI /
composite action that reads your workflow runs + jobs with the repo token (no org
admin, no billing access) and splits CI minutes and list-price cost into human /
AI-agent / bot, attributing re-runs to `triggering_actor`. Honest bits: it's a
list-price model (not your invoice — included minutes are consumed first), accuracy
±5–10%, unknown runners are flagged, and anything we can't classify lands in a
visible "unattributed" bucket instead of being silently re-assigned. Methodology in
the README. The hosted version will do the nightly reconciliation against the
billing API ("our sum = your invoice line"). Curious what share of CI spend is
agent-triggered in your repo — the action answers that in one run.

## r/devops (калибровочный кейс-пост; вставить реальные цифры своего репо)

**Title:** We split our GitHub Actions bill into human vs AI-agent vs bot — the agent share surprised us

Context: Copilot code review eats Actions minutes since June (the 958-downvote
thread), our bill went $X → $Y and nobody could explain which part was agents.
I wrote a small OSS action that attributes every run to human / agent / bot via
`triggering_actor` and prices jobs with the 2026 SKU rates. Result for our repo
(last 30 days): agents $A (B%), bots C runs (D%), top burner workflow: E.
It's list-price accounting (±5–10%), methodology is public, and it needs zero admin
rights — repo token with actions:read. Sharing because the "explain the bill to my
manager" thread keeps coming up here. What's your agent share? The action answers
in one run; happy to compare numbers in the comments.

## Ответ-инструмент в GH discussions (#192948-треды, #199062, #199986, #202838)

> The usage views don't break minutes down by who triggered the run — we hit the
> same wall. As a stopgap we open-sourced a composite action that attributes runs
> to human / AI agent / bot (Copilot coding agent, claude[bot], etc.) using
> `triggering_actor`, with the 2026 per-SKU rates and a visible "unattributed"
> bucket. Repo-level token only, no org admin: <link>. Not a fix for the double
> billing itself — but it answers "which part of the bill is agents" today, and
> the numbers are useful ammunition in this thread.

Правила (из брифа): помогать, не спамить; отвечать только там, где наш инструмент
действительно решает описанную боль; disclose, что мы авторы.

# Changelog

All notable changes to costgrep. Format: [Keep a Changelog](https://keepachangelog.com/);
versions follow semver. Pre-1.0 breaking changes are possible in minor bumps and are
marked **BREAKING** below.

## [0.7.3] — 2026-10-04
### Fixed (external edge-harness findings)
- **Per-request HTTP timeout** (default 30 s, `COSTGREP_TIMEOUT_MS` to override):
  hanging or stalled-mid-stream API endpoints now fail with an honest error
  instead of hanging the run for minutes.
- **Crash-free error exit:** the error path sets `exitCode` instead of a forced
  `process.exit(1)` — exiting while fetch sockets are still alive could trip a
  libuv assertion on Windows (observed as 0xC0000409 with a mock server).
- `COSTGREP_API` env hook: point the CLI at a local mock for verification —
  no more file patching in external reviews.
- New built-in edge harness (`test/edge.test.mjs`, async-spawn + mock server):
  hanging, stalled, garbage-body, HTTP-500 — all honest-fail, verified for real.

## [0.7.2] — 2026-10-04
### Fixed (verification round 3 nits)
- SECURITY.md final paragraph no longer claims "every request goes to api.github.com
  and nothing else" (the opt-in Slack webhook exists); phrased exactly now.
- The `v1` release notes no longer hardcode a version ("currently v0.3.1" had drifted
  three releases behind) — they link to the Releases page, so they cannot go stale.

## [0.7.1] — 2026-10-04
### Fixed (verification round 2 findings)
- Org-mode Markdown printed `undefined` for jobs-fetched / in-progress counts —
  org provenance now carries `jobsFetched`, `inProgressExcluded`, `orgVisibility`.
- Org reports now carry the money notice (compatibility contract): mixed
  public/private described with the macOS/larger-runner exception and cost.
- SECURITY.md self-contradiction removed ("only api.github.com" / "never reads
  billing endpoints" vs the opt-in sections); surface statement now exact.
- `--help` shows the version and `--slack-webhook` (contract: help stays complete).
- README: fresh dated snapshot (now includes the `agent-assisted` row — 14 of 50
  runs in the example repo), `--slack-webhook` in the flags, `agent-assisted-cost`
  in the outputs table, "single-file core + agents.json" phrasing.
- Table alignment fits the longest class name; org Markdown skips empty tables.
- v0.4.0 release notes: reproducibility command for the first agent-assisted catch.

## [0.7.0] — 2026-10-04
### Added
- Stability contract (docs/compatibility.md): what is frozen in the JSON report,
  evidence columns, action outputs, exit codes; additive-only rules.
- Standalone methodology page (docs/methodology.md) — now the canonical text;
  README keeps the summary.
- Calibration kit (docs/calibration.md): step-by-step validation against the
  GitHub Usage UI / a real invoice + self-report template.

## [0.6.0] — 2026-10-03
### Added
- `--slack-webhook` (+ action input `slack-webhook`): post the report to a Slack
  incoming webhook (URL validated to `hooks.slack.com`).
- `--pr-comment` appends a "This PR's CI so far" section: $ / minutes across all
  runs on the PR head SHA, with class split.
- README gate recipes: budget fail-gate, weekly Slack audit, PR cost stamp.

## [0.5.0] — 2026-10-03
### Added
- `reconcile` subcommand (EXPERIMENTAL): our recomputation vs the enhanced billing
  platform usage API per SKU per calendar month; delta lands in an explicit
  `unattributed` bucket; coverage warnings (unscanned repos, `--max-runs` caps);
  over-attribution reported, not hidden.
- `credits` subcommand (EXPERIMENTAL): AI credit usage by model; per-user caveat
  (API does not expose it; `--user` filter exists).
- Month-bounded run windows for calendar-month parity.

## [0.4.0] — 2026-10-03
### Added
- `--org NAME [--repos N]`: org/user-wide audit without org-admin rights
  (falls back org→user listing); aggregate report with top-repos ranking.
- Class `agent-assisted`: human-triggered runs whose head commit carries an AI
  `Co-Authored-By` trailer (zero extra API calls; separate class, never merged
  into `agent`; `--no-coab` to disable).
- `--pr-comment N|auto` (+ action input): post the Markdown report as a PR comment.
- `agents.json`: slug lists are data now — extend by PR, no code.
- Output `agent-assisted-cost`.

## [0.3.1] — 2026-10-03
### Fixed
- Marketing drafts purged from the entire git history (removed from HEAD in 0.3.0
  but remained retrievable — now zero traces in fresh clones).
### Added
- Evidence rows (JSON + CSV) carry `rate_fallback` and `conclusion`.
- **BREAKING** (report field): `inProgressRuns` renamed to `inProgressJobs`.
- `.gitattributes` (eol=lf); README snapshot byte-exact.

## [0.3.0] — 2026-10-02
### Fixed
- README example is a real dated snapshot with the exact command.
- skipped / zero-duration jobs: billed at the 1-min minimum, explicitly counted
  and costed in every report as an exact subtrahend; methodology matches code.
- action.yml: all user inputs via env (script-injection hardening).
- `--repo` validated (owner/name pattern); usage/help lists every flag;
  SECURITY.md full surface; package.json repository/homepage/bugs; named LICENSE
  holder; CI matrix Node 18/22.

## [0.2.1] — 2026-10-02
### Added
- Repo visibility detection: public repos print "standard Linux/Windows minutes
  are FREE — the $ is list-price VALUE, not money owed" (macOS/larger exception
  called out); private repos get the included-minutes framing; unknown stays silent.

## [0.2.0] — 2026-10-02
### Added
- `evidence[]` per billable job (JSON) + `--csv-file` audit trail;
  provenance block in every report; `--md-file`; action outputs for CI budget gates;
  SECURITY.md, CONTRIBUTING.md; benchmark of 6 public repos with per-job evidence.

## [0.1.0] — 2026-10-01
- Initial wedge: zero-dependency CLI + composite action, human/agent/bot
  attribution via `triggering_actor`, 2026 SKU rate matrix, honesty flags, MIT
  (relicensed Apache-2.0 before first contributor).

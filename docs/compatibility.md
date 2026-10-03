# Compatibility & stability contract

What you can rely on, and from which version. Semver applies; pre-1.0 breaking
changes may land in minor bumps and are marked BREAKING in
[CHANGELOG.md](../CHANGELOG.md).

## Frozen from 0.7.0 (changes only in majors, or additive)

- **Class names**: `agent`, `agent-assisted`, `human`, `bot`, `unattributed`.
- **Exit codes**: `0` success (including "empty window" reports), `1` any error —
  errors are messages on stderr, never silent zeros.
- **Evidence row columns** (JSON keys and CSV column order):
  `run_id, run_number, workflow, event, actor_login, actor_type, class, job_id,
  job_name, started_at, completed_at, minutes, sku, rate_usd_per_min, cost_usd,
  runner_labels, rate_fallback, conclusion`.
- **Action outputs**: `total-cost`, `total-minutes`, `agent-cost`,
  `agent-share-pct`, `agent-assisted-cost`, `agent-runs`, `bot-runs`, `bot-runs-pct`.
- **The invariant**: summing `cost_usd`/`minutes` over evidence rows equals the
  headline totals, exactly. If this ever breaks, it is a bug of the highest severity.
- **Money semantics**: every `$` figure is list-price value of compute; reports
  must always carry the public/private notice and the list-price disclaimer.

## Additive-only (new keys may appear, existing keys never change meaning)

- JSON report top-level fields and `provenance` keys.
- Action inputs.
- CLI flags (existing flags keep their spelling and meaning; `--help` stays complete).

## Explicitly unstable until 1.0

- The JSON shape of `reconcile` / `credits` outputs (EXPERIMENTAL subcommands).
- Org-mode aggregation fields (`topReposByCost` layout may gain columns).
- Rate matrix values (they track GitHub's price list; version-stamped in provenance).

## From 1.0

- Strict semver. Breaking changes to anything in the frozen list require a major
  bump. The `v1` action tag stays a floating major pointing at the latest stable.

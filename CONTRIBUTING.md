# Contributing

Two kinds of contributions matter here — and one explicit non-goal.

## 1. Data: the agent/bot lists and the rate matrix

This tool's accuracy lives in two datasets inside `scripts/costgrep.mjs`:

- `DEFAULT_AGENTS` — logins of AI coding agents / AI reviewers,
- `DEFAULT_BOTS` — automation bots,
- `DEFAULT_RATES` — per-SKU list prices.

When proposing changes:

- **New agent/bot slug:** include evidence — a link to a public workflow run,
  PR, or doc showing that login (e.g. a run whose `triggering_actor.login`
  is the slug you're adding). We don't add slugs on hearsay; misclassification
  silently moves dollars between classes.
- **Rate change:** must cite
  [docs.github.com billing reference](https://docs.github.com/en/billing/reference/actions-runner-pricing)
  (or a github.blog announcement) and state the effective date. Rates are
  money — uncited rate PRs will be closed.
- Keep contains-matches **narrow**: prefer `'cursor'` over broad stems that can
  collide with human logins; note the collision risk in the PR.

## 2. Code

- Zero runtime dependencies is a feature (supply-chain surface = 0, single-file
  auditability). PRs adding npm deps will be declined — vendor nothing.
- `npm test` must pass. If you touch the cost engine, add/adjust a fixture test
  in `test/cli.test.mjs` — the existing suite pins the math to the cent.
- New CLI flags need: implementation, README mention, and a test.

## Non-goal

Please don't send PRs that make numbers *look* nicer — hiding the
`unattributed` bucket, silent rate guessing, or invoice claims we can't
reconcile. The product's whole point is that every figure is checkable;
changes that reduce checkability are out of scope by design.

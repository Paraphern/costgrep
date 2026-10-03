# Calibration kit

The 1.0 release gate is: **accuracy demonstrated on ≥5 real organizations, with
reconciliation delta ≤5%, evidence published.** This kit is how a data point gets
contributed. Anyone can run it — it uses only data you already can see.

## Level 1 — Usage UI check (anyone, 10 minutes, no billing rights)

1. Pick one repository and a closed window (e.g. last full week or month).
2. Run: `node scripts/costgrep.mjs --repo OWNER/REPO --days N --json-file r.json`
3. Open GitHub → repo/org **Usage** view for the same window. Record billable
   minutes per workflow.
4. Compare against the JSON's per-workflow minutes (same per-job round-up).
5. Fill the self-report below and open an issue titled `calibration: OWNER/REPO`.

## Level 2 — Invoice check (org with billing access)

1. Run `costgrep reconcile --org ORG --month YYYY-MM --billing-token ...`
2. Attach (or transcribe) the tool's output: per-SKU billing vs ours, the delta,
   and the coverage warnings.
3. If you can see the actual invoice/PDF for the month, note whether the billing
   API's `netAmount` matches the invoice line (that validates the *source*, not us).
4. Open an issue titled `calibration: ORG (invoice)`.

## Self-report template

```
repo/org:            <owner/repo or org>
window:              <YYYY-MM-DD .. YYYY-MM-DD>
costgrep version:    <costgrep --help | head -1, or the tag you used>
minutes: costgrep <A> vs usage UI <B>  -> delta <A-B> (<%>)
cost:     costgrep <$X> (list price)
notes:    <rate-fallback jobs? skipped jobs? macOS share? anything odd>
verdict:  <matches / small drift / large drift — describe>
```

## What we do with reports

- Aggregated (anonymized unless you opt in) into the published accuracy table that
  backs the ±5–10% claim — or replaces it with a measured number.
- Large drifts become issues with your evidence attached; the fix ships with a
  regression test, per the project's doctrine: every number must stay checkable.
- The skipped/zero-duration question ("does GitHub bill them?") closes with the
  first invoice-grade reports: the tool already prints the exact subtrahend.

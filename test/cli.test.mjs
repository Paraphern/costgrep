import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts', 'costgrep.mjs');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'demo-repo');

const mod = await import(`file://${CLI.replace(/\\/g, '/')}`);
const { classifyActor, jobMinutes, inferRate, buildReport, renderTable, renderMarkdown, renderCsv, outputsFor, visibilityNotice, norm, DEFAULT_RATES } = mod;

const run = (overrides = {}) => {
  const actor = overrides.actor ?? { login: 'x', type: 'User' };
  return { actor, triggering_actor: overrides.triggering_actor ?? actor, ...overrides };
};
const cfg = { agents: mod.DEFAULT_AGENTS, bots: mod.DEFAULT_BOTS, rates: DEFAULT_RATES };
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// --- attribution -----------------------------------------------------------
test('norm strips [bot] suffix and lowercases', () => {
  assert.equal(norm('Copilot-SWE-Agent[bot]'), 'copilot-swe-agent');
});

test('classifies AI agents before the generic Bot rule', () => {
  assert.equal(classifyActor(run({ actor: { login: 'copilot-swe-agent[bot]', type: 'Bot' } }), cfg).klass, 'agent');
  assert.equal(classifyActor(run({ actor: { login: 'Copilot', type: 'Bot' } }), cfg).klass, 'agent');
  assert.equal(classifyActor(run({ actor: { login: 'claude[bot]', type: 'Bot' } }), cfg).klass, 'agent');
  assert.equal(classifyActor(run({ actor: { login: 'cursor[bot]', type: 'Bot' } }), cfg).klass, 'agent');
});

test('classifies humans and automation bots', () => {
  assert.equal(classifyActor(run(), cfg).klass, 'human');
  assert.equal(classifyActor(run({ actor: { login: 'github-actions[bot]', type: 'Bot' } }), cfg).klass, 'bot');
  assert.equal(classifyActor(run({ actor: { login: 'dependabot[bot]', type: 'Bot' } }), cfg).klass, 'bot');
  assert.equal(classifyActor(run({ actor: { login: 'some-unknown-app[bot]', type: 'Bot' } }), cfg).klass, 'bot');
  assert.equal(classifyActor(run({ actor: { login: '', type: '' } }), cfg).klass, 'unattributed');
});

test('re-runs attribute to triggering_actor, not original actor', () => {
  const r = classifyActor(run({ actor: { login: 'copilot-swe-agent[bot]', type: 'Bot' }, triggering_actor: { login: 'boris-oncall', type: 'User' } }), cfg);
  assert.equal(r.klass, 'human');
  assert.equal(r.login, 'boris-oncall');
});

// --- cost engine -----------------------------------------------------------
test('minutes round up per job like GitHub billing', () => {
  const job = (s, e) => ({ started_at: s, completed_at: e });
  assert.equal(jobMinutes(job('2026-01-01T00:00:00Z', '2026-01-01T00:00:59Z')), 1);
  assert.equal(jobMinutes(job('2026-01-01T00:00:00Z', '2026-01-01T00:01:01Z')), 2); // 61s -> 2
  assert.equal(jobMinutes(job('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')), 1);  // instant -> min 1
  assert.equal(jobMinutes({ started_at: null, completed_at: null }), 0);              // skipped
  assert.equal(jobMinutes({ started_at: '2026-01-01T00:00:00Z', completed_at: null }), 0); // in progress
});

test('rate inference: families, arm, larger runners, self-hosted, fallback', () => {
  approx(inferRate({ labels: ['ubuntu-latest'] }, cfg).rate, 0.006);
  approx(inferRate({ labels: ['ubuntu-latest', 'arm64'] }, cfg).rate, 0.005);
  approx(inferRate({ labels: ['windows-latest'] }, cfg).rate, 0.010);
  approx(inferRate({ labels: ['macos-latest'] }, cfg).rate, 0.062);
  approx(inferRate({ labels: ['macos-latest-large'] }, cfg).rate, 0.077);
  approx(inferRate({ labels: ['macos-latest-xlarge'] }, cfg).rate, 0.102);
  approx(inferRate({ labels: ['linux-8-core', 'x64'] }, cfg).rate, 0.022);
  approx(inferRate({ labels: ['linux-16-core', 'arm64'] }, cfg).rate, 0.026);
  approx(inferRate({ labels: ['self-hosted', 'linux', 'x64'] }, cfg).rate, 0.0);
  assert.equal(inferRate({ labels: ['ubuntu-latest'] }, cfg).fallback, false);
  assert.equal(inferRate({ labels: ['weird-runner-label'] }, cfg).fallback, true);
});

// --- full report on the demo fixture ----------------------------------------
const runs = JSON.parse(readFileSync(join(FIXTURE, 'runs.json'), 'utf8'));
const jobsByRun = new Map(runs.map(r => [r.id, r.jobs || []]));
let rep;
try {
  rep = buildReport('demo/repo', runs, jobsByRun, cfg, 30);
} catch (e) {
  console.error(e); throw e;
}

test('fixture: class totals (cost & minutes)', () => {
  approx(rep.totals.human.cost, 0.148);   // anna $0.136 + boris re-run $0.012
  approx(rep.totals.human.minutes, 18);
  approx(rep.totals.agent.cost, 0.118);   // swe-agent $0.058 + Copilot review $0.024 + claude $0.036
  approx(rep.totals.agent.minutes, 20);
  approx(rep.totals.bot.cost, 1.460);     // macos $1.24 + 8-core $0.22; dependabot self-hosted $0
  approx(rep.totals.bot.minutes, 33);     // includes 3 self-hosted minutes
  approx(rep.totals.agent.pctCost, (0.118 / 1.726) * 100, 1e-6);
  assert.equal(rep.totals.agent.runs, 3);
  assert.equal(rep.totals.human.runs, 3);
  assert.equal(rep.totals.bot.runs, 2);
});

test('fixture: global totals, self-hosted bucket, honesty flags', () => {
  assert.equal(rep.runsAnalyzed, 8);
  assert.equal(rep.jobsCounted, 10);
  approx(rep.totalCost, 1.726);
  assert.equal(rep.totalMinutes, 71);
  assert.equal(rep.selfHosted.jobs, 1);
  assert.equal(rep.selfHosted.minutes, 3);
  assert.equal(rep.rateFallbackJobs, 1);
  assert.equal(rep.inProgressRuns, 1);
});

test('fixture: top workflows by cost', () => {
  assert.equal(rep.topWorkflowsByCost[0].workflow, 'Nightly E2E');
  approx(rep.topWorkflowsByCost[0].cost, 1.460);
  assert.equal(rep.topWorkflowsByCost[1].workflow, 'CI');
  assert.equal(rep.topWorkflowsByCost.length, 3);
});

test('renderers mention the headline numbers', () => {
  const t = renderTable(rep);
  assert.ok(t.includes('Agents cost $0.12'), t);
  assert.ok(t.includes('Bot runs: 2 (25.0% of all runs)'), t);
  assert.ok(t.includes('self-hosted'), t);
  const md = renderMarkdown(rep);
  assert.ok(md.includes('$0.12 from AI agents'), md);
  assert.ok(md.includes('| agent | 3 |'), md);
});

test('markdown carries a provenance block a human can follow', () => {
  const md = renderMarkdown(rep);
  assert.ok(md.includes('Where these numbers come from'), md);
  assert.ok(md.includes('/repos/demo/repo/actions/runs'), md);
  assert.ok(md.includes('triggering_actor'), md);
  assert.ok(md.includes('2026-01-01'), md);          // rates version
  assert.ok(md.includes('Deterministic'), md);
  assert.ok(md.includes('evidence[]'), md);
});

test('evidence: per-job rows recompute the headline totals exactly', () => {
  assert.equal(rep.evidence.length, rep.jobsCounted);
  const sumCost = +rep.evidence.reduce((s, e) => s + e.cost_usd, 0).toFixed(9);
  approx(sumCost, rep.totalCost);
  const sumMin = rep.evidence.reduce((s, e) => s + e.minutes, 0);
  assert.equal(sumMin, rep.totalMinutes);
  const j7 = rep.evidence.find(e => e.job_id === 'j7');
  assert.equal(j7.class, 'bot');
  approx(j7.rate_usd_per_min, 0.062);
  assert.equal(j7.minutes, 20);
  approx(j7.cost_usd, 1.24);
  const j9 = rep.evidence.find(e => e.job_id === 'j9');
  assert.equal(j9.sku, 'self_hosted');
  approx(j9.cost_usd, 0);
  const j10 = rep.evidence.find(e => e.job_id === 'j10');
  assert.equal(j10.class, 'agent'); // claude[bot], not generic bot
});

test('csv: header + one row per counted job, spreadsheet-safe', () => {
  const csv = renderCsv(rep);
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines.length, rep.jobsCounted + 1);
  assert.ok(lines[0].startsWith('run_id,run_number,workflow,event,actor_login,actor_type,class'));
  assert.ok(lines[0].includes('rate_usd_per_min,cost_usd,runner_labels'));
  const j4 = lines.find(l => l.includes('j4'));
  assert.ok(j4.includes('ubuntu-latest|arm64'), j4);
});

test('outputs for the CI budget gate', () => {
  const o = outputsFor(rep);
  assert.equal(o['agent-cost'], '0.1180');
  assert.equal(o['agent-share-pct'], '6.8');
  assert.equal(o['bot-runs-pct'], '25.0');
  assert.equal(o['total-cost'], '1.7260');
  assert.equal(o['total-minutes'], '71');
});

test('skipped & zero-duration jobs: billed at the 1-min minimum, flagged as a subtrahend', () => {
  const runs = [{
    id: 9, name: 'CI', event: 'push', run_number: 9, created_at: '2026-09-25T00:00:00Z',
    actor: { login: 'a-dev', type: 'User' }, triggering_actor: { login: 'a-dev', type: 'User' },
    jobs: [
      { id: 'sk', name: 'skippy', conclusion: 'skipped', started_at: '2026-09-25T00:00:00Z', completed_at: '2026-09-25T00:00:00Z', labels: ['ubuntu-latest'] },
      { id: 'ok', name: 'normal', conclusion: 'success', started_at: '2026-09-25T00:00:00Z', completed_at: '2026-09-25T00:01:00Z', labels: ['ubuntu-latest'] },
    ],
  }];
  const r = buildReport('x/y', runs, new Map(runs.map(x => [x.id, x.jobs])), cfg, 30);
  assert.equal(r.skippedJobs, 1);
  assert.equal(r.zeroDurationJobs, 1); // the skipped job is also zero-duration
  approx(r.skippedCost, 0.006);
  approx(r.totalCost, 0.012); // both jobs at the 1-min minimum
  const t = renderTable(r);
  assert.ok(t.includes('billed at the 1-min minimum'), t);
  assert.ok(t.includes('$0.012 included'), t); // exact subtrahend surfaced
});

test('--repo is validated (owner/name only, no query/path tricks)', () => {
  assert.throws(() => execFileSync(process.execPath, [CLI, '--repo', 'x?per_page=1#', '--days', '1'], { encoding: 'utf8', stdio: 'pipe' }), /invalid --repo/);
  assert.throws(() => execFileSync(process.execPath, [CLI, '--repo', 'a/../../users/o', '--days', '1'], { encoding: 'utf8', stdio: 'pipe' }), /invalid --repo/);
});

test('visibility notice: a list-price figure must never read as money owed', () => {
  const mk = (repoVisibility, billed) => ({ provenance: { repoVisibility, billedEvenIfPublic: billed } });
  // public repo, only free runner classes: "you paid $0" must be unmissable
  const pub = visibilityNotice(mk('public', { jobs: 0, cost: 0 }));
  assert.ok(pub.includes('FREE'), pub);
  assert.ok(pub.includes('not money owed'), pub);
  assert.ok(!pub.includes('NOTE'), pub);
  // public repo WITH macos/larger jobs: the exception is spelled out
  const pubM = visibilityNotice(mk('public', { jobs: 3, cost: 0.15 }));
  assert.ok(pubM.includes('ARE billed even for public repos'), pubM);
  assert.ok(pubM.includes('$0.15'), pubM);
  // private repo: included-minutes framing
  const priv = visibilityNotice(mk('private', { jobs: 0, cost: 0 }));
  assert.ok(priv.includes('included plan minutes'), priv);
  // unknown: silence beats a guess
  assert.equal(visibilityNotice(mk('unknown', { jobs: 0, cost: 0 })), null);
});

test('fixture report (unknown visibility) carries no guess about billing', () => {
  assert.equal(rep.provenance.repoVisibility, 'unknown');
  const t = renderTable(rep);
  assert.ok(!t.includes('repo: standard Linux/Windows'), t);
  const md = renderMarkdown(rep);
  assert.ok(md.includes('(could not determine)'), md);
});

test('CLI end-to-end on fixture: files on disk + gh-output', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'costgrep-'));
  try {
    const ghOut = join(tmp, 'out.txt');
    const out = execFileSync(process.execPath,
      [CLI, '--fixture-dir', FIXTURE, '--days', '4000', '--quiet',
       '--md-file', join(tmp, 'r.md'), '--csv-file', join(tmp, 'e.csv'), '--gh-output', ghOut],
      { encoding: 'utf8' });
    assert.ok(out.includes('costgrep — (fixture)'), out);
    assert.ok(out.includes('Agents cost $0.12'), out);
    const md = readFileSync(join(tmp, 'r.md'), 'utf8');
    assert.ok(md.includes('Where these numbers come from'), md);
    assert.ok(md.includes('$0.12 from AI agents'), md);
    const csv = readFileSync(join(tmp, 'e.csv'), 'utf8');
    assert.equal(csv.trimEnd().split('\n').length, rep.jobsCounted + 1);
    const gh = readFileSync(ghOut, 'utf8');
    assert.ok(gh.includes('agent-share-pct=6.8'), gh);
    assert.ok(gh.includes('total-cost=1.7260'), gh);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

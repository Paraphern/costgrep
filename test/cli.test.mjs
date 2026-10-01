import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts', 'agent-ci-report.mjs');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'demo-repo');

const mod = await import(`file://${CLI.replace(/\\/g, '/')}`);
const { classifyActor, jobMinutes, inferRate, buildReport, renderTable, renderMarkdown, norm, DEFAULT_RATES } = mod;

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

test('CLI end-to-end on fixture (offline mode)', () => {
  const out = execFileSync(process.execPath,
    [CLI, '--fixture-dir', FIXTURE, '--days', '4000', '--quiet'],
    { encoding: 'utf8' });
  assert.ok(out.includes('agent-ci-report — (fixture)'), out);
  assert.ok(out.includes('Agents cost $0.12'), out);
  assert.ok(out.includes('Bot runs: 2 (25.0% of all runs)'), out);
});

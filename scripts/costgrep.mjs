#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * costgrep — GitHub Actions cost breakdown: human vs AI-agent vs bot.
 *
 * Zero-dependency (Node >= 18). Runs on YOUR runner, talks only to
 * api.github.com with the token you pass. No telemetry, no data leaves your infra.
 *
 * Methodology (public, see README):
 *   minutes(job) = ceil((completed_at - started_at) / 60s), min 1 per started job
 *                  (GitHub rounds each job up to a whole minute)
 *   cost(job)    = minutes x rate[runner class]   (list-price matrix, docs.github.com,
 *                  effective 2026-01-01; NOT the invoice — included plan minutes
 *                  are consumed first; reconciliation vs billing API is the hosted phase)
 *   attribution  = run.triggering_actor (falls back to run.actor), classified as
 *                  agent | human | bot via slug lists (overridable via --config)
 *   self-hosted  = $0 while the $0.002/min platform fee is postponed
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Rate matrix — GitHub-hosted runners, list prices effective 2026-01-01.
// Source: docs.github.com/en/billing/reference/actions-runner-pricing (SKUid names
// match billing usage reports, which is what the later reconciliation joins on).
// Override anything via --config {"rates": {...}}.
// ---------------------------------------------------------------------------
const DEFAULT_RATES = {
  'actions_linux_slim': 0.002,   // Linux 1-core x64
  'actions_linux': 0.006,        // Linux 2-core x64
  'actions_linux_arm': 0.005,    // Linux 2-core arm64
  'actions_windows': 0.010,      // Windows 2-core x64
  'actions_windows_arm': 0.010,  // Windows 2-core arm64
  'actions_macos': 0.062,        // macOS 3/4-core
  'macos_l': 0.077,              // macOS 12-core
  'macos_xl': 0.102,             // macOS 5-core M2 Pro
  'self_hosted': 0.0,            // $0.002/min platform fee postponed as of 2026-10
  larger: {
    x64: {
      linux:   { 4: 0.012, 8: 0.022, 16: 0.042, 32: 0.082, 64: 0.162, 96: 0.252 },
      windows: { 4: 0.022, 8: 0.042, 16: 0.082, 32: 0.162, 64: 0.322, 96: 0.552 },
    },
    arm: {
      linux:   { 2: 0.005, 4: 0.008, 8: 0.014, 16: 0.026, 32: 0.050, 64: 0.098 },
      windows: { 2: 0.008, 4: 0.014, 8: 0.026, 16: 0.050, 32: 0.098, 64: 0.194 },
    },
  },
  gpu: { linux: 0.052, windows: 0.102 }, // 4-core GPU
};

// Logins (normalized: lowercase, "[bot]" stripped) classified as AI coding agents /
// AI reviewers. Contains-match. Extend via --config {"agents": [...]}.
const DEFAULT_AGENTS = [
  'copilot', 'copilot-swe-agent', 'claude', 'cursor', 'codex', 'openai-codex',
  'gemini', 'gemini-code-assist', 'jules', 'devin', 'aider', 'windsurf',
  'codebuff', 'opencode', 'goose', 'factory', 'sweep', 'coderabbit',
  'qodo', 'greptile', 'ellipsis', 'codeant', 'kodu', 'ampcode',
];

// Automation bots (exact match after normalization). Everything else with
// actor.type == "Bot" / login ending in "[bot]" is also treated as a bot.
const DEFAULT_BOTS = [
  'github-actions', 'actions-user', 'dependabot', 'renovate', 'greenkeeper',
  'imgbot', 'allcontributors', 'lock', 'stash', 'bors', 'mergify',
  'semantic-release-bot', 'codecov', 'coveralls', 'netlify', 'vercel',
  'github-advanced-security', 'fossa', 'changeset-bot',
];

const CLASS_ORDER = ['agent', 'human', 'bot', 'unattributed'];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseCli() {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string' },            // owner/name; default $GITHUB_REPOSITORY
      days: { type: 'string', default: '30' },
      token: { type: 'string' },           // default $GITHUB_TOKEN (optional for public repos)
      'max-runs': { type: 'string', default: '1000' },
      config: { type: 'string' },          // JSON file: {agents, bots, rates}
      'fixture-dir': { type: 'string' },   // offline mode: runs.json with embedded jobs
      'json-file': { type: 'string' },     // write full report JSON here
      'step-summary': { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(`usage: costgrep.mjs [--repo owner/name] [--days 30] [--token TOKEN]
                 [--max-runs N] [--config FILE] [--fixture-dir DIR]
                 [--json-file FILE] [--step-summary] [--quiet]`);
    process.exit(0);
  }
  values.days = Math.max(1, parseInt(values.days, 10) || 30);
  values['max-runs'] = parseInt(values['max-runs'], 10) || 1000;
  values.repo = values.repo || process.env.GITHUB_REPOSITORY;
  return values;
}

function loadConfig(path) {
  const cfg = { agents: [...DEFAULT_AGENTS], bots: [...DEFAULT_BOTS], rates: DEFAULT_RATES };
  if (!path) return cfg;
  if (!existsSync(path)) throw new Error(`config file not found: ${path}`);
  const user = JSON.parse(readFileSync(path, 'utf8'));
  if (user.agents) cfg.agents = [...new Set([...cfg.agents, ...user.agents.map(norm)])];
  if (user.bots) cfg.bots = [...new Set([...cfg.bots, ...user.bots.map(norm)])];
  if (user.rates) cfg.rates = { ...DEFAULT_RATES, ...user.rates, larger: { ...DEFAULT_RATES.larger, ...(user.rates.larger || {}) } };
  return cfg;
}

// ---------------------------------------------------------------------------
// GitHub API (paginated, one retry on rate limit)
// ---------------------------------------------------------------------------
async function gh(path, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'costgrep',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, { headers });
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
      if (attempt === 0) {
        const wait = Math.min(Math.max(reset - Date.now(), 2000), 60_000);
        if (!process.env.COSTGREP_NO_WAIT) {
          console.error(`rate limit hit, retrying in ${Math.round(wait / 1000)}s`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
      }
      throw new Error(`GitHub API rate limited on ${path} (403/429). Pass --token or narrow --days/--max-runs.`);
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

async function listRuns(repo, sinceIso, token, maxRuns) {
  const runs = [];
  for (let page = 1; ; page++) {
    const data = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${page}`, token);
    const batch = data.workflow_runs || [];
    for (const r of batch) {
      if (r.created_at && new Date(r.created_at) < sinceIso) return runs; // sorted newest-first
      runs.push(r);
      if (runs.length >= maxRuns) return runs;
    }
    if (runs.length >= (data.total_count ?? 0) || batch.length < 100) return runs;
  }
}

async function listJobs(repo, runId, token) {
  const jobs = [];
  for (let page = 1; ; page++) {
    const data = await gh(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`, token);
    jobs.push(...(data.jobs || []));
    if (jobs.length >= (data.total_count ?? 0) || (data.jobs || []).length < 100) return jobs;
  }
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------
function norm(login) {
  return String(login || '').toLowerCase().replace(/\[bot\]$/, '').trim();
}

function classifyActor(run, cfg) {
  // triggering_actor is who effectively caused this execution: the re-runner for
  // re-runs, and the honest identity for workflow_run chains (github.actor may
  // resolve to a generic bot there — see github/gh-aw#20586).
  const src = run.triggering_actor?.login ? run.triggering_actor : run.actor;
  const login = src?.login || '';
  const type = src?.type || '';
  const n = norm(login);
  if (!n) return { login, klass: 'unattributed' };
  if (cfg.agents.some(a => n.includes(norm(a)))) return { login, klass: 'agent' };
  if (type === 'User') return { login, klass: 'human' };
  if (cfg.bots.includes(n) || type === 'Bot' || login.endsWith('[bot]')) return { login, klass: 'bot' };
  return { login, klass: 'unattributed' };
}

// ---------------------------------------------------------------------------
// Cost engine
// ---------------------------------------------------------------------------
function jobMinutes(job) {
  if (!job.started_at) return 0; // queued/skipped jobs never ran
  if (!job.completed_at) return 0; // in progress — excluded, counted separately
  const ms = new Date(job.completed_at) - new Date(job.started_at);
  return Math.max(1, Math.ceil(ms / 60_000)); // GitHub rounds each job up
}

function inferRate(job, cfg) {
  const labels = (job.labels || []).map(l => String(l).toLowerCase());
  const has = s => labels.some(l => l.includes(s));
  const cores = (() => {
    for (const l of labels) {
      const m = l.match(/(?:^|[-_ ])(\d{1,2})[-_ ]?core/);
      if (m) return Number(m[1]);
    }
    return null;
  })();
  const arm = has('arm64') || has('arm');
  const r = cfg.rates;

  if (labels.includes('self-hosted')) return { sku: 'self_hosted', rate: r.self_hosted, fallback: false };
  if (has('macos')) {
    if (has('xlarge') || has('xl') || has('m2')) return { sku: 'macos_xl', rate: r.macos_xl, fallback: false };
    if (has('large') || cores === 12) return { sku: 'macos_l', rate: r.macos_l, fallback: false };
    return { sku: 'actions_macos', rate: r.actions_macos, fallback: false };
  }
  if (has('gpu')) {
    const fam = has('windows') ? 'windows' : 'linux';
    return { sku: `${fam}_gpu`, rate: r.gpu[fam], fallback: false };
  }
  const isWindows = has('windows');
  const isLinux = has('ubuntu') || has('linux');
  if (isWindows || isLinux) {
    const fam = isWindows ? 'windows' : 'linux';
    if (cores && cores > 2) {
      const table = r.larger[arm ? 'arm' : 'x64'][fam];
      if (table[cores] != null) return { sku: `${fam}_${cores}_core`, rate: table[cores], fallback: false };
    }
    if (fam === 'linux') {
      if (has('slim') || cores === 1) return { sku: 'actions_linux_slim', rate: r.actions_linux_slim, fallback: false };
      if (arm) return { sku: 'actions_linux_arm', rate: r.actions_linux_arm, fallback: false };
    }
    if (fam === 'windows') return { sku: 'actions_windows', rate: r.actions_windows, fallback: false };
    return { sku: 'actions_linux', rate: r.actions_linux, fallback: false };
  }
  // Unknown runner: fall back to the standard Linux rate and flag it — never
  // silently guess an expensive rate.
  return { sku: 'actions_linux', rate: r.actions_linux, fallback: true };
}

function buildReport(repo, runs, jobsByRun, cfg, days) {
  const totals = Object.fromEntries(CLASS_ORDER.map(k => [k, { runs: 0, jobs: 0, minutes: 0, cost: 0 }]));
  const selfHosted = { jobs: 0, minutes: 0 }; // $0 while the platform fee is postponed
  let inProgressRuns = 0, rateFallbackJobs = 0, countedJobs = 0, totalMinutes = 0, totalCost = 0;
  const byWorkflow = new Map(); // workflow name -> {class -> {cost, minutes}} (agent view)
  const byActor = new Map();

  for (const run of runs) {
    const { login, klass } = classifyActor(run, cfg);
    const jobs = jobsByRun.get(run.id) || [];
    let runMinutes = 0, runCost = 0, anyJobCounted = false;
    for (const job of jobs) {
      const mins = jobMinutes(job);
      if (!job.started_at) continue;
      if (!job.completed_at) { inProgressRuns++; continue; }
      const { sku, rate, fallback } = inferRate(job, cfg);
      if (fallback) rateFallbackJobs++;
      if (sku === 'self_hosted') { selfHosted.jobs++; selfHosted.minutes += mins; }
      const cost = mins * rate;
      runMinutes += mins; runCost += cost; countedJobs++; anyJobCounted = true;
      totalMinutes += mins; totalCost += cost;
      const wf = run.name || '(unnamed workflow)';
      if (!byWorkflow.has(wf)) byWorkflow.set(wf, { cost: 0, minutes: 0, runs: new Set() });
      byWorkflow.get(wf).cost += cost;
      byWorkflow.get(wf).minutes += mins;
      byWorkflow.get(wf).runs.add(run.id);
    }
    totals[klass].runs += 1;
    if (anyJobCounted) {
      totals[klass].jobs += jobs.filter(j => j.started_at && j.completed_at).length;
      totals[klass].minutes += runMinutes;
      totals[klass].cost += runCost;
    }
    if (login) {
      if (!byActor.has(login)) byActor.set(login, { login, klass, runs: 0, minutes: 0, cost: 0 });
      const a = byActor.get(login);
      a.runs += 1; a.minutes += runMinutes; a.cost += runCost;
    }
  }

  const pct = (x, of) => (of > 0 ? (100 * x) / of : 0);
  for (const k of CLASS_ORDER) {
    totals[k].pctCost = pct(totals[k].cost, totalCost);
    totals[k].pctRuns = pct(totals[k].runs, runs.length);
  }

  const topWorkflowsByCost = [...byWorkflow.entries()]
    .map(([name, v]) => ({ workflow: name, cost: v.cost, minutes: v.minutes, runs: v.runs.size, pctOfTotal: pct(v.cost, totalCost) }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 3);

  const topActors = [...byActor.values()].sort((a, b) => b.cost - a.cost).slice(0, 8);

  return {
    repo,
    window: { days, from: runs.length ? runs[runs.length - 1].created_at : null, to: runs.length ? runs[0].created_at : null },
    generatedAt: new Date().toISOString(),
    pricingModel: 'github-hosted list prices effective 2026-01-01 (see methodology in README)',
    totals,
    topWorkflowsByCost,
    topActors,
    runsAnalyzed: runs.length,
    jobsCounted: countedJobs,
    totalMinutes,
    totalCost,
    selfHosted,
    inProgressRuns,
    rateFallbackJobs,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);

function renderTable(rep) {
  const L = [];
  L.push(`\ncostgrep — ${rep.repo} (last ${rep.window.days} days, ${rep.runsAnalyzed} runs, ${rep.jobsCounted} jobs)`);
  L.push('='.repeat(72));
  L.push('class      runs   run%    minutes       cost    cost%');
  L.push('-'.repeat(72));
  for (const k of CLASS_ORDER) {
    const t = rep.totals[k];
    L.push(
      `${k.padEnd(9)} ${String(t.runs).padStart(5)} ${t.pctRuns.toFixed(1).padStart(5)}%` +
      ` ${String(Math.round(t.minutes)).padStart(9)} ${money(t.cost).padStart(10)} ${t.pctCost.toFixed(1).padStart(6)}%`
    );
  }
  L.push('-'.repeat(72));
  L.push(`${'total'.padEnd(9)} ${String(rep.runsAnalyzed).padStart(5)}        ${String(Math.round(rep.totalMinutes)).padStart(9)} ${money(rep.totalCost).padStart(10)}`);
  if (rep.selfHosted.jobs > 0) L.push(`(plus ${rep.selfHosted.jobs} self-hosted jobs, ${Math.round(rep.selfHosted.minutes)} min — $0 while the platform fee is postponed)`);
  L.push('');
  const a = rep.totals.agent;
  L.push(`>>> Agents cost ${money(a.cost)} (${a.pctCost.toFixed(1)}% of CI spend, ${a.runs} runs / ${a.pctRuns.toFixed(1)}%).`);
  L.push(`>>> Bot runs: ${rep.totals.bot.runs} (${rep.totals.bot.pctRuns.toFixed(1)}% of all runs), bot spend ${money(rep.totals.bot.cost)}.`);
  if (rep.topWorkflowsByCost.length) {
    L.push('>>> Top workflows by total cost:');
    for (const w of rep.topWorkflowsByCost) L.push(`    ${money(w.cost).padStart(10)}  ${w.pctOfTotal.toFixed(1).padStart(5)}%  ${w.workflow}`);
  }
  if (rep.rateFallbackJobs > 0) L.push(`>>> honesty note: ${rep.rateFallbackJobs} jobs had unrecognized runner labels — priced at the standard Linux rate.`);
  L.push('>>> List-price model: NOT your invoice. Included plan minutes are consumed first; hosted phase reconciles against the billing API.');
  return L.join('\n');
}

function renderMarkdown(rep) {
  const a = rep.totals.agent;
  const rows = CLASS_ORDER.map(k => {
    const t = rep.totals[k];
    return `| ${k} | ${t.runs} | ${t.pctRuns.toFixed(1)}% | ${Math.round(t.minutes)} | ${money(t.cost)} | ${t.pctCost.toFixed(1)}% |`;
  }).join('\n');
  const wf = rep.topWorkflowsByCost.map(w => `| ${w.workflow} | ${money(w.cost)} | ${w.pctOfTotal.toFixed(1)}% |`).join('\n');
  return `## 🤖 costgrep — ${rep.repo}

**${money(a.cost)} from AI agents (${a.pctCost.toFixed(1)}% of CI spend)** · bot runs: ${rep.totals.bot.runs} (${rep.totals.bot.pctRuns.toFixed(1)}%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
${rows}

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
${wf}

_List-price model (2026 rates), not the invoice. ${rep.rateFallbackJobs} jobs used the rate fallback.${rep.selfHosted.jobs ? ` ${rep.selfHosted.jobs} self-hosted jobs ($0).` : ''} Methodology: README._
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseCli();
  const cfg = loadConfig(args.config);
  const since = new Date(Date.now() - args.days * 86_400_000);

  let runs, jobsByRun;
  if (args['fixture-dir']) {
    const dir = args['fixture-dir'];
    runs = JSON.parse(readFileSync(`${dir}/runs.json`, 'utf8'));
    jobsByRun = new Map(runs.map(r => [r.id, r.jobs || []]));
    runs = runs.filter(r => !r.created_at || new Date(r.created_at) >= since).slice(0, args['max-runs']);
  } else {
    if (!args.repo) throw new Error('--repo owner/name (or GITHUB_REPOSITORY) required');
    const token = args.token || process.env.GITHUB_TOKEN;
    runs = await listRuns(args.repo, since, token, args['max-runs']);
    jobsByRun = new Map();
    let done = 0;
    for (const run of runs) {
      jobsByRun.set(run.id, await listJobs(args.repo, run.id, token));
      if (!args.quiet && ++done % 50 === 0) console.error(`  ...fetched jobs for ${done}/${runs.length} runs`);
    }
  }

  const rep = buildReport(args.repo || '(fixture)', runs, jobsByRun, cfg, args.days);
  console.log(renderTable(rep));

  if (args['json-file']) {
    writeFileSync(args['json-file'], JSON.stringify(rep, null, 2));
    console.error(`full report written to ${args['json-file']}`);
  }
  if (args['step-summary'] && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(rep) + '\n');
  }
  return rep;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) {
  main().catch(e => { console.error(`error: ${e.message}`); process.exit(1); });
}

export { classifyActor, jobMinutes, inferRate, buildReport, renderTable, renderMarkdown, DEFAULT_RATES, DEFAULT_AGENTS, DEFAULT_BOTS, norm };

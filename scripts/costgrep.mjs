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

// Co-Authored-By trailer names (normalized) treated as agent co-authorship.
// Fallback mirror of agents.json for single-file deployments.
const DEFAULT_COAUTHORS = [
  'copilot', 'claude', 'cursor', 'gemini', 'codex', 'devin', 'aider',
  'windsurf', 'jules', 'goose', 'codebuff', 'opencode',
];

const CLASS_ORDER = ['agent', 'agent-assisted', 'human', 'bot', 'unattributed'];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseCli() {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string' },            // owner/name; default $GITHUB_REPOSITORY
      org: { type: 'string' },             // org-wide mode: audit all visible repos of this org/user
      repos: { type: 'string', default: '20' }, // org mode: how many repos (sorted by last push)
      days: { type: 'string', default: '30' },
      token: { type: 'string' },           // default $GITHUB_TOKEN (optional for public repos)
      'max-runs': { type: 'string' },      // per repo; default 1000 (org mode: 100)
      config: { type: 'string' },          // JSON file: {agents, bots, rates, coab}
      'no-coab': { type: 'boolean', default: false }, // disable Co-Authored-By agent-assisted detection
      'pr-comment': { type: 'string' },    // post the report as a PR comment: number or 'auto'
      'fixture-dir': { type: 'string' },   // offline mode: runs.json with embedded jobs
      'json-file': { type: 'string' },     // write full report JSON here (incl. evidence[] + provenance)
      'md-file': { type: 'string' },       // write shareable Markdown report with provenance block
      'csv-file': { type: 'string' },      // write per-job evidence CSV (audit trail)
      'gh-output': { type: 'string' },     // append KEY=VALUE outputs to this file (GitHub $GITHUB_OUTPUT)
      'slack-webhook': { type: 'string' }, // post the report to a Slack incoming webhook (https://hooks.slack.com/services/...)
      'step-summary': { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(`usage: costgrep.mjs [--repo owner/name | --org NAME [--repos N]] [--days 30] [--token TOKEN]
                 [--max-runs N] [--config FILE] [--no-coab] [--pr-comment N|auto] [--fixture-dir DIR]
                 [--json-file FILE] [--md-file FILE] [--csv-file FILE]
                 [--gh-output FILE] [--step-summary] [--quiet]`);
    process.exit(0);
  }
  values.days = Math.max(1, parseInt(values.days, 10) || 30);
  values.repos = Math.max(1, parseInt(values.repos, 10) || 20);
  values['max-runs'] = parseInt(values['max-runs'] ?? '', 10) || (values.org ? 100 : 1000);
  values.repo = values.repo || (values['fixture-dir'] || values.org ? null : process.env.GITHUB_REPOSITORY);
  if (values.repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(values.repo)) {
    throw new Error(`invalid --repo "${values.repo}" — expected owner/name (letters, digits, . _ -)`);
  }
  if (values.org && !/^[A-Za-z0-9-]+$/.test(values.org)) {
    throw new Error(`invalid --org "${values.org}" — expected an org/user login`);
  }
  return values;
}

function loadConfig(path) {
  const cfg = {
    agents: [...DEFAULT_AGENTS], bots: [...DEFAULT_BOTS], rates: DEFAULT_RATES,
    coab: true, coauthorNames: [...DEFAULT_COAUTHORS],
  };
  // The bundled agents.json extends the baked-in lists — data PRs don't touch code.
  try {
    const bundled = JSON.parse(readFileSync(new URL('../agents.json', import.meta.url), 'utf8'));
    if (bundled.agents) cfg.agents = [...new Set([...cfg.agents, ...bundled.agents.map(norm)])];
    if (bundled.bots) cfg.bots = [...new Set([...cfg.bots, ...bundled.bots.map(norm)])];
    if (bundled.coauthorNames) cfg.coauthorNames = [...new Set([...cfg.coauthorNames, ...bundled.coauthorNames.map(norm)])];
  } catch { /* single-file deployments keep the baked-in defaults */ }
  if (!path) return cfg;
  if (!existsSync(path)) throw new Error(`config file not found: ${path}`);
  const user = JSON.parse(readFileSync(path, 'utf8'));
  if (user.agents) cfg.agents = [...new Set([...cfg.agents, ...user.agents.map(norm)])];
  if (user.bots) cfg.bots = [...new Set([...cfg.bots, ...user.bots.map(norm)])];
  if (user.coauthorNames) cfg.coauthorNames = [...new Set([...cfg.coauthorNames, ...user.coauthorNames.map(norm)])];
  if (user.coab === false) cfg.coab = false;
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

async function ghPost(path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'costgrep',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function listOrgRepos(org, token, limit) {
  const out = [];
  for (let page = 1; ; page++) {
    const q = `?sort=pushed&direction=desc&per_page=100&page=${page}`;
    let data;
    try {
      data = await gh(`/orgs/${org}/repos${q}`, token);
    } catch (e) {
      if (String(e.message).includes(' 404 ')) data = await gh(`/users/${org}/repos${q}`, token); // user account
      else throw e;
    }
    for (const r of (Array.isArray(data) ? data : [])) {
      out.push(r.full_name);
      if (out.length >= limit) return out;
    }
    if (!Array.isArray(data) || data.length < 100) return out;
  }
}

async function listRuns(repo, sinceIso, token, maxRuns, untilIso) {
  const runs = [];
  for (let page = 1; ; page++) {
    const data = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${page}`, token);
    const batch = data.workflow_runs || [];
    for (const r of batch) {
      const t = r.created_at && new Date(r.created_at);
      if (t && t < sinceIso) return runs; // sorted newest-first
      if (untilIso && t && t >= untilIso) continue; // past the window (recent first)
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

// Co-Authored-By trailers in the head commit message: a human-triggered run whose
// commit was co-authored by an AI agent. Known limit (stated in methodology): some
// editors (e.g. VS Code) auto-insert the Copilot trailer — so this is a separate
// `agent-assisted` class, never silently merged into `agent`.
function coAuthoredByAgent(message, cfg) {
  if (!cfg.coab || !message) return false;
  const trailers = String(message).match(/co-authored-by:[^\r\n]+/gi) || [];
  return trailers.some(t => cfg.coauthorNames.some(n => norm(t).includes(norm(n))));
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
  if (type === 'User') {
    if (coAuthoredByAgent(run.head_commit?.message, cfg)) return { login, klass: 'agent-assisted' };
    return { login, klass: 'human' };
  }
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

async function repoVisibility(repo, token) {
  try {
    const r = await gh(`/repos/${repo}`, token);
    return r.private ? 'private' : 'public';
  } catch { return 'unknown'; }
}

// Standard Linux/Windows hosted minutes are FREE for public repositories;
// macOS and larger runners are billed even there. Say so explicitly —
// a list-price figure must never read as "money you owe".
function visibilityNotice(rep) {
  const v = rep.provenance.repoVisibility;
  const billed = rep.provenance.billedEvenIfPublic || { jobs: 0, cost: 0 };
  const note = (extra) =>
    `>>> ${v} repo: standard Linux/Windows minutes are ${v === 'public' ? 'FREE — the $ above is the list-price VALUE of this compute (what it would cost in a private repo), not money owed' : 'list-price; included plan minutes are consumed before these amounts reach the invoice'}.${extra}`;
  if (v === 'public') {
    return note(billed.jobs > 0
      ? ` NOTE: ${billed.jobs} macOS/larger-runner jobs ARE billed even for public repos (~$${billed.cost.toFixed(2)}).`
      : '');
  }
  if (v === 'private') return note('');
  return null; // unknown — stay silent rather than guess
}

function buildReport(repo, runs, jobsByRun, cfg, days, repoVis = 'unknown') {
  const totals = Object.fromEntries(CLASS_ORDER.map(k => [k, { runs: 0, jobs: 0, minutes: 0, cost: 0 }]));
  const selfHosted = { jobs: 0, minutes: 0 }; // $0 while the platform fee is postponed
  let inProgressJobs = 0, rateFallbackJobs = 0, countedJobs = 0, totalMinutes = 0, totalCost = 0;
  let skippedJobs = 0, skippedCost = 0, zeroDurationJobs = 0, zeroDurationCost = 0;
  const byWorkflow = new Map(); // workflow name -> {class -> {cost, minutes}} (agent view)
  const byActor = new Map();
  const evidence = []; // one row per billable job — the audit trail behind every aggregate
  const jobsFetched = runs.reduce((s, r) => s + (jobsByRun.get(r.id) || []).length, 0);

  for (const run of runs) {
    const { login, klass } = classifyActor(run, cfg);
    const src = run.triggering_actor?.login ? run.triggering_actor : run.actor;
    const srcType = src?.type || '';
    const jobs = jobsByRun.get(run.id) || [];
    let runMinutes = 0, runCost = 0, anyJobCounted = false;
    for (const job of jobs) {
      const mins = jobMinutes(job);
      if (!job.started_at) continue;
      if (!job.completed_at) { inProgressJobs++; continue; }
      const { sku, rate, fallback } = inferRate(job, cfg);
      if (fallback) rateFallbackJobs++;
      if (sku === 'self_hosted') { selfHosted.jobs++; selfHosted.minutes += mins; }
      const cost = mins * rate;
      runMinutes += mins; runCost += cost; countedJobs++; anyJobCounted = true;
      // Jobs with runner timestamps but conclusion=skipped or zero/negative duration
      // are billed at the 1-min minimum. Whether GitHub bills them identically is
      // unverifiable without invoice access — so we flag them with exact totals
      // instead of silently deciding either way.
      if (job.conclusion === 'skipped') { skippedJobs++; skippedCost += cost; }
      if (new Date(job.completed_at) <= new Date(job.started_at)) { zeroDurationJobs++; zeroDurationCost += cost; }
      evidence.push({
        run_id: run.id, run_number: run.run_number ?? '', workflow: run.name || '(unnamed)',
        event: run.event || '', actor_login: login, actor_type: srcType, class: klass,
        job_id: job.id, job_name: job.name || '', started_at: job.started_at, completed_at: job.completed_at,
        minutes: mins, sku, rate_usd_per_min: rate, cost_usd: cost,
        runner_labels: (job.labels || []).join('|'),
        rate_fallback: fallback, conclusion: job.conclusion ?? '',
      });
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
    inProgressJobs,
    rateFallbackJobs,
    skippedJobs, skippedCost, zeroDurationJobs, zeroDurationCost,
    evidence,
    provenance: {
      repoVisibility: repoVis,
      billedEvenIfPublic: (() => {
        let jobs = 0, cost = 0;
        for (const e of evidence) {
          if (e.sku === 'actions_macos' || e.sku === 'macos_l' || e.sku === 'macos_xl' ||
              e.sku.endsWith('_gpu') || /\d+_core$/.test(e.sku)) { jobs++; cost += e.cost_usd; }
        }
        return { jobs, cost };
      })(),
      dataSources: [
        `GET /repos/${repo}/actions/runs (workflow-run metadata)`,
        'GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job)',
        'GET /repos/{repo} (repository visibility: public/private)',
      ],
      neverAccessed: 'repository code, logs, secrets — workflow metadata only',
      attribution: 'run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed',
      skippedPolicy: 'jobs holding runner timestamps (incl. conclusion=skipped / zero duration) are billed at the 1-min minimum and reported separately — subtract them if your invoice proves GitHub does not bill such executions',
      rates: 'GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing',
      ratesVersion: '2026-01-01',
      selfHostedPolicy: '$0/min while the $0.002 platform fee is postponed; minutes still counted',
      jobsFetched,
      inProgressExcluded: inProgressJobs,
      deterministic: 'same repo + window -> same numbers',
    },
  };
}

// Org mode: aggregate per-repo reports into one org-level report. Windows vary
// per repo (--max-runs cap per repo) — stated in provenance, never averaged away.
function buildOrgReport(org, reports) {
  const totals = Object.fromEntries(CLASS_ORDER.map(k => [k, { runs: 0, jobs: 0, minutes: 0, cost: 0 }]));
  const selfHosted = { jobs: 0, minutes: 0 };
  let totalMinutes = 0, totalCost = 0, runsAnalyzed = 0, jobsCounted = 0, inProgressJobs = 0;
  let rateFallbackJobs = 0, skippedJobs = 0, skippedCost = 0, zeroDurationJobs = 0, zeroDurationCost = 0;
  const actors = new Map();
  for (const r of reports) {
    for (const k of CLASS_ORDER) {
      totals[k].runs += r.totals[k].runs; totals[k].jobs += r.totals[k].jobs;
      totals[k].minutes += r.totals[k].minutes; totals[k].cost += r.totals[k].cost;
    }
    selfHosted.jobs += r.selfHosted.jobs; selfHosted.minutes += r.selfHosted.minutes;
    totalMinutes += r.totalMinutes; totalCost += r.totalCost;
    runsAnalyzed += r.runsAnalyzed; jobsCounted += r.jobsCounted; inProgressJobs += r.inProgressJobs;
    rateFallbackJobs += r.rateFallbackJobs;
    skippedJobs += r.skippedJobs; skippedCost += r.skippedCost;
    zeroDurationJobs += r.zeroDurationJobs; zeroDurationCost += r.zeroDurationCost;
    // topActors are per-repo top-8 — the merged view is approximate for large orgs
    for (const a of r.topActors) {
      if (!actors.has(a.login)) actors.set(a.login, { ...a });
      else { const x = actors.get(a.login); x.runs += a.runs; x.minutes += a.minutes; x.cost += a.cost; }
    }
  }
  const pct = (x, of) => (of > 0 ? (100 * x) / of : 0);
  for (const k of CLASS_ORDER) {
    totals[k].pctCost = pct(totals[k].cost, totalCost);
    totals[k].pctRuns = pct(totals[k].runs, runsAnalyzed);
  }
  const froms = reports.map(r => r.window.from).filter(Boolean).sort();
  return {
    repo: `org: ${org}`,
    org: true,
    reposAnalyzed: reports.length,
    window: { days: reports[0]?.window.days, from: froms[0] ?? null, to: froms[froms.length - 1] ?? null },
    generatedAt: new Date().toISOString(),
    pricingModel: reports[0]?.pricingModel,
    totals,
    topReposByCost: [...reports].sort((a, b) => b.totalCost - a.totalCost).slice(0, 5)
      .map(r => ({ repo: r.repo, runs: r.runsAnalyzed, minutes: Math.round(r.totalMinutes), cost: r.totalCost, agentPct: r.totals.agent.pctCost })),
    topActors: [...actors.values()].sort((a, b) => b.cost - a.cost).slice(0, 8),
    runsAnalyzed, jobsCounted, totalMinutes, totalCost, selfHosted, inProgressJobs,
    rateFallbackJobs, skippedJobs, skippedCost, zeroDurationJobs, zeroDurationCost,
    evidence: [], // per-repo evidence lives in each repo report (org report is the aggregate)
    provenance: {
      repoVisibility: 'mixed — per-repo in each repo report',
      dataSources: [
        'GET /orgs/{org}/repos (or /users/{login}/repos) — repo list sorted by last push',
        'GET /repos/{repo}/actions/runs (workflow-run metadata)',
        'GET /repos/{repo}/actions/runs/{id}/jobs (job metadata, latest attempt per job)',
        'GET /repos/{repo} (repository visibility: public/private)',
      ],
      neverAccessed: 'repository code, logs, secrets — workflow metadata only',
      attribution: 'run.triggering_actor (fallback run.actor) -> agent | human | bot | unattributed (+ agent-assisted via Co-Authored-By when enabled)',
      rates: 'GitHub-hosted list prices effective 2026-01-01 — docs.github.com/en/billing/reference/actions-runner-pricing',
      ratesVersion: '2026-01-01',
      selfHostedPolicy: '$0/min while the $0.002 platform fee is postponed; minutes still counted',
      orgMode: `per-repo windows vary — ${reports.length} repos, each capped at its --max-runs most recent runs`,
      skippedPolicy: 'jobs holding runner timestamps (incl. conclusion=skipped / zero duration) are billed at the 1-min minimum and reported separately — subtract them if your invoice proves GitHub does not bill such executions',
      deterministic: 'same repos + windows -> same numbers',
    },
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
  if (rep.topWorkflowsByCost?.length) {
    L.push('>>> Top workflows by total cost:');
    for (const w of rep.topWorkflowsByCost) L.push(`    ${money(w.cost).padStart(10)}  ${w.pctOfTotal.toFixed(1).padStart(5)}%  ${w.workflow}`);
  }
  if (rep.topReposByCost?.length) {
    L.push('>>> Top repos by total cost (agent% of that repo):');
    for (const r of rep.topReposByCost) L.push(`    ${money(r.cost).padStart(10)}  ${r.agentPct.toFixed(1).padStart(5)}%  ${r.repo}`);
  }
  if (rep.rateFallbackJobs > 0) L.push(`>>> honesty note: ${rep.rateFallbackJobs} jobs had unrecognized runner labels — priced at the standard Linux rate.`);
  const q = rep.skippedJobs + rep.zeroDurationJobs;
  if (q > 0) L.push(`>>> honesty note: ${rep.skippedJobs} skipped and ${rep.zeroDurationJobs} zero-duration jobs billed at the 1-min minimum ($${(rep.skippedCost + rep.zeroDurationCost).toFixed(3)} included; subtract if your invoice proves GitHub doesn't bill them).`);
  const vn = visibilityNotice(rep);
  if (vn) L.push(vn);
  L.push('>>> List-price model: NOT your invoice. Included plan minutes are consumed first; hosted phase reconciles against the billing API.');
  return L.join('\n');
}

function renderMarkdown(rep) {
  const a = rep.totals.agent;
  const rows = CLASS_ORDER.map(k => {
    const t = rep.totals[k];
    return `| ${k} | ${t.runs} | ${t.pctRuns.toFixed(1)}% | ${Math.round(t.minutes)} | ${money(t.cost)} | ${t.pctCost.toFixed(1)}% |`;
  }).join('\n');
  const wf = (rep.topWorkflowsByCost || []).map(w => `| ${w.workflow} | ${money(w.cost)} | ${w.pctOfTotal.toFixed(1)}% |`).join('\n');
  const repos = (rep.topReposByCost || []).map(r => `| ${r.repo} | ${money(r.cost)} | ${r.agentPct.toFixed(1)}% |`).join('\n');
  const p = rep.provenance;
  return `## 🤖 costgrep — ${rep.repo}

**${money(a.cost)} from AI agents (${a.pctCost.toFixed(1)}% of CI spend)** · bot runs: ${rep.totals.bot.runs} (${rep.totals.bot.pctRuns.toFixed(1)}%)

| class | runs | run% | minutes | cost | cost% |
|---|---|---|---|---|---|
${rows}

Top workflows by cost:

| workflow | cost | % |
|---|---|---|
${wf}
${repos ? `\nTop repos by cost (agent% of repo):\n\n| repo | cost | agent% |\n|---|---|---|\n${repos}` : ''}

### Where these numbers come from

- **Repo visibility:** ${p.repoVisibility}${p.repoVisibility === 'public' ? ` — standard Linux/Windows hosted minutes are **free** for public repositories; the $ figures are the list-price value of this compute, not money owed${p.billedEvenIfPublic.jobs > 0 ? `. Exception: ${p.billedEvenIfPublic.jobs} macOS/larger-runner jobs are billed even for public repos (~$${p.billedEvenIfPublic.cost.toFixed(2)}).` : '.'}` : p.repoVisibility === 'private' ? ' — list-price model; included plan minutes are consumed before these amounts reach the invoice.' : ' (could not determine).'}
- **Data:** ${p.dataSources[0]}; ${p.dataSources[1]}. ${p.neverAccessed}.
- **Window:** last ${rep.window.days} days (${rep.window.from ?? '—'} → ${rep.window.to ?? '—'}), ${rep.runsAnalyzed} runs, ${rep.jobsCounted} of ${p.jobsFetched} fetched jobs counted (${p.inProgressExcluded} in-progress jobs excluded).
- **Attribution:** ${p.attribution}.
- **Rates:** ${p.rates}. Self-hosted: ${p.selfHostedPolicy}.
- **Honesty flags:** ${rep.rateFallbackJobs} jobs on the rate fallback (unknown runner labels → standard Linux rate); skipped/zero-duration jobs billed at the 1-min minimum: ${rep.skippedJobs + rep.zeroDurationJobs} ($${(rep.skippedCost + rep.zeroDurationCost).toFixed(3)} included — subtract if your invoice differs); unattributed: ${rep.totals.unattributed.runs} runs.

_List-price model — NOT the invoice: included plan minutes are consumed first. Deterministic: ${p.deterministic}. Verify any number against the per-job \`evidence[]\` in the JSON / CSV export. Full methodology: README._
`;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Per-job audit trail: open it in any spreadsheet and recompute minutes x rate —
// the sums must equal the headline totals.
function renderCsv(rep) {
  const cols = ['run_id', 'run_number', 'workflow', 'event', 'actor_login', 'actor_type', 'class',
    'job_id', 'job_name', 'started_at', 'completed_at', 'minutes', 'sku', 'rate_usd_per_min', 'cost_usd',
    'runner_labels', 'rate_fallback', 'conclusion'];
  const lines = [cols.join(',')];
  for (const e of rep.evidence) lines.push(cols.map(c => csvEscape(e[c])).join(','));
  return lines.join('\n') + '\n';
}

function outputsFor(rep) {
  return {
    'total-cost': rep.totalCost.toFixed(4),
    'total-minutes': String(Math.round(rep.totalMinutes)),
    'agent-cost': rep.totals.agent.cost.toFixed(4),
    'agent-share-pct': rep.totals.agent.pctCost.toFixed(1),
    'agent-assisted-cost': (rep.totals['agent-assisted']?.cost ?? 0).toFixed(4),
    'agent-runs': String(rep.totals.agent.runs),
    'bot-runs': String(rep.totals.bot.runs),
    'bot-runs-pct': rep.totals.bot.pctRuns.toFixed(1),
  };
}

// ---------------------------------------------------------------------------
// Reconciliation & AI credits (experimental — org billing endpoints)
// ---------------------------------------------------------------------------
// These subcommands read /organizations/{org}/settings/billing/* — the only
// places in costgrep that require an org token with billing rights. They are
// invoked explicitly (reconcile | credits) and everything they print carries
// the experimental label: this code path is not yet validated against a live
// billing account, so deltas are hypotheses until calibrated on an invoice.

const EXPERIMENTAL = 'EXPERIMENTAL: not yet validated against a live billing account — treat deltas as hypotheses until calibrated (methodology in README).';

function monthBounds(year, month) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1)); // month is 1-based -> this is the 1st of the next month
  return { from, to };
}

async function fetchBillingUsage(org, year, month, token) {
  const data = await gh(`/organizations/${org}/settings/billing/usage?year=${year}&month=${month}`, token);
  return data.usageItems || [];
}

async function fetchAiCredits(org, year, month, token, user) {
  const u = user ? `&user=${encodeURIComponent(user)}` : '';
  const data = await gh(`/organizations/${org}/settings/billing/ai_credit/usage?year=${year}&month=${month}${u}`, token);
  return data;
}

// Pure: billing items + our per-repo reports -> the reconciliation verdict.
// billingHasMore > 0 means money the invoice sees that we could not attribute.
function buildReconciliation(billingItems, repoReports, coverage) {
  const actions = billingItems.filter(i => /actions/i.test(String(i.product || '')));
  const billingTotal = actions.reduce((s, i) => s + (i.netAmount || 0), 0);
  const billingBySku = new Map();
  for (const i of actions) billingBySku.set(i.sku, (billingBySku.get(i.sku) || 0) + (i.netAmount || 0));
  const billingRepos = new Set(actions.map(i => i.repositoryName).filter(Boolean));

  const ourBySku = new Map();
  let ourTotal = 0;
  for (const rep of repoReports) {
    ourTotal += rep.totalCost;
    for (const e of rep.evidence) ourBySku.set(e.sku, (ourBySku.get(e.sku) || 0) + e.cost_usd);
  }

  const skus = [...new Set([...billingBySku.keys(), ...ourBySku.keys()])].sort();
  const perSku = skus.map(sku => {
    const b = billingBySku.get(sku) || 0, o = ourBySku.get(sku) || 0;
    return { sku, billing: b, ours: o, delta: b - o };
  });
  const delta = billingTotal - ourTotal;
  const deltaPct = billingTotal > 0 ? (100 * delta) / billingTotal : 0;

  const warnings = [];
  if (coverage.reposScanned < coverage.reposInBilling) {
    warnings.push(`coverage: billing names ${coverage.reposInBilling} repositories with Actions usage; we scanned ${coverage.reposScanned} most-recently-pushed (--repos) — unscanned repos land in the delta`);
  }
  if (coverage.runsCapped) warnings.push('coverage: at least one repo hit the --max-runs cap — runs beyond the cap are invisible to our side of the comparison');
  if (!billingItems.length) warnings.push('billing returned zero usage items — check the org, the month, and that the org is on the enhanced billing platform');

  return {
    billingTotal, ourTotal, delta, deltaPct, perSku,
    unattributed: delta > 0 ? delta : 0,
    overattributed: delta < 0 ? -delta : 0,
    billingRepos: billingRepos.size, warnings,
    experimental: true,
  };
}

function renderReconciliation(rec, orgLabel, year, month) {
  const L = [];
  L.push(`\ncostgrep reconcile — ${orgLabel} ${year}-${String(month).padStart(2, '0')} (billing API vs our recomputation)`);
  L.push('='.repeat(78));
  L.push('SKU                          billing $      ours $     delta $');
  L.push('-'.repeat(78));
  for (const s of rec.perSku) {
    L.push(`${String(s.sku).padEnd(26)} ${s.billing.toFixed(2).padStart(9)} ${s.ours.toFixed(2).padStart(11)} ${s.delta.toFixed(2).padStart(11)}`);
  }
  L.push('-'.repeat(78));
  L.push(`${'TOTAL'.padEnd(26)} ${rec.billingTotal.toFixed(2).padStart(9)} ${rec.ourTotal.toFixed(2).padStart(11)} ${rec.delta.toFixed(2).padStart(11)}  (${rec.deltaPct.toFixed(1)}%)`);
  L.push('');
  L.push(`>>> unattributed (billing sees it, we can't attribute): $${rec.unattributed.toFixed(2)}${rec.overattributed > 0 ? ` · we attribute MORE than billing: $${rec.overattributed.toFixed(2)} (check rate assumptions)` : ''}`);
  for (const w of rec.warnings) L.push(`>>> ${w}`);
  L.push(`>>> ${EXPERIMENTAL}`);
  return L.join('\n');
}

function renderCredits(data, orgLabel, year, month) {
  const items = data.usageItems || [];
  const total = items.reduce((s, i) => s + (i.netAmount || 0), 0);
  const byModel = new Map();
  for (const i of items) byModel.set(i.model || '(unknown)', (byModel.get(i.model || '(unknown)') || 0) + (i.netAmount || 0));
  const L = [];
  L.push(`\ncostgrep credits — ${orgLabel} ${year}-${String(month).padStart(2, '0')} (AI credits from the billing API)`);
  L.push('='.repeat(60));
  for (const [model, cost] of [...byModel.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`${String(model).padEnd(40)} $${cost.toFixed(2)}`);
  }
  L.push('-'.repeat(60));
  L.push(`${'TOTAL AI CREDITS'.padEnd(40)} $${total.toFixed(2)}`);
  L.push('');
  L.push('>>> per-user breakdown is not exposed by the API — filter with --user <login>');
  L.push(`>>> ${EXPERIMENTAL}`);
  return L.join('\n');
}

// PR-scoped section for --pr-comment: everything whose head SHA == the PR head.
function prSection(rep, runsArr, headSha) {
  if (!headSha || !runsArr) return '';
  const prRunIds = new Set(runsArr.filter(r => r.head_sha === headSha).map(r => r.id));
  const rows = rep.evidence.filter(e => prRunIds.has(e.run_id));
  if (!rows.length) return '';
  const cost = rows.reduce((s, e) => s + e.cost_usd, 0);
  const mins = rows.reduce((s, e) => s + e.minutes, 0);
  const byClass = {};
  for (const e of rows) byClass[e.class] = (byClass[e.class] || 0) + e.cost_usd;
  const split = Object.entries(byClass).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} $${v.toFixed(2)}`).join(' · ');
  return `\n### This PR's CI so far\n\n**${money(cost)} · ${Math.round(mins)} minutes** across ${prRunIds.size} runs on head \`${headSha.slice(0, 10)}\` (${split})\n`;
}

async function postSlack(url, text) {
  if (!/^https:\/\/hooks\.slack\.com\/services\//.test(url)) {
    throw new Error('--slack-webhook: expected an https://hooks.slack.com/services/... URL');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '```\n' + text.slice(0, 2900) + '\n```' }),
  });
  if (!res.ok) throw new Error(`Slack webhook responded ${res.status}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function prevMonth(now = new Date()) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

function parseSideArgs(kind) {
  const { values } = parseArgs({
    options: {
      org: { type: 'string' },
      month: { type: 'string' },           // YYYY-MM; default = previous full month
      'billing-token': { type: 'string' }, // org token with billing rights (falls back to --token / GITHUB_TOKEN)
      token: { type: 'string' },           // for run metadata (actions:read)
      repos: { type: 'string', default: '20' },
      'max-runs': { type: 'string' },
      'json-file': { type: 'string' },
      user: { type: 'string' },            // credits: filter by user
      quiet: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    args: process.argv.slice(3),
  });
  if (values.help) {
    console.log(`usage: costgrep.mjs ${kind} --org NAME [--month YYYY-MM] [--billing-token T]\n                 [--token T] [--repos N] [--max-runs N] [--json-file F]${kind === 'credits' ? ' [--user LOGIN]' : ''}`);
    process.exit(0);
  }
  let year, month;
  if (values.month) {
    const m = values.month.match(/^(\d{4})-(\d{2})$/);
    if (!m || +m[2] < 1 || +m[2] > 12) throw new Error(`invalid --month "${values.month}" — expected YYYY-MM`);
    year = +m[1]; month = +m[2];
  } else ({ year, month } = prevMonth());
  values.year = year; values.month = month;
  values.repos = Math.max(1, parseInt(values.repos, 10) || 20);
  values['max-runs'] = parseInt(values['max-runs'] ?? '', 10) || 100;
  if (values.org && !/^[A-Za-z0-9-]+$/.test(values.org)) throw new Error(`invalid --org "${values.org}"`);
  return values;
}

async function orgReportsForWindow(org, from, to, cfg, token, reposLimit, maxRuns, quiet) {
  const repos = await listOrgRepos(org, token, reposLimit);
  const reports = [];
  let runsCapped = false;
  for (let i = 0; i < repos.length; i++) {
    const r = repos[i];
    const vis = await repoVisibility(r, token);
    const rr = await listRuns(r, from, token, maxRuns, to);
    if (rr.length >= maxRuns) runsCapped = true;
    if (!rr.length) continue;
    const jm = new Map();
    for (const run of rr) jm.set(run.id, await listJobs(r, run.id, token));
    const one = buildReport(r, rr, jm, cfg, Math.max(1, Math.round((to - from) / 86_400_000)), vis);
    reports.push(one);
    if (!quiet) console.error(`  [${i + 1}/${repos.length}] ${r}: ${rr.length} runs, $${one.totalCost.toFixed(2)}`);
  }
  return { repos, reports, runsCapped };
}

async function reconcileMain() {
  const a = parseSideArgs('reconcile');
  if (!a.org) throw new Error('reconcile: --org NAME required');
  const cfg = loadConfig(null);
  const runsToken = a.token || process.env.GITHUB_TOKEN;
  const billingToken = a['billing-token'] || a.token || process.env.GITHUB_TOKEN;
  const { from, to } = monthBounds(a.year, a.month);
  const items = await fetchBillingUsage(a.org, a.year, a.month, billingToken);
  const { repos, reports, runsCapped } = await orgReportsForWindow(a.org, from, to, cfg, runsToken, a.repos, a['max-runs'], a.quiet);
  const billingRepos = new Set(items.filter(i => /actions/i.test(String(i.product || ''))).map(i => i.repositoryName).filter(Boolean)).size;
  const rec = buildReconciliation(items, reports, { reposScanned: repos.length, reposInBilling: billingRepos, runsCapped });
  console.log(renderReconciliation(rec, `org: ${a.org}`, a.year, a.month));
  if (a['json-file']) writeFileSync(a['json-file'], JSON.stringify(rec, null, 2));
}

async function creditsMain() {
  const a = parseSideArgs('credits');
  if (!a.org) throw new Error('credits: --org NAME required');
  const billingToken = a['billing-token'] || a.token || process.env.GITHUB_TOKEN;
  let data;
  try {
    data = await fetchAiCredits(a.org, a.year, a.month, billingToken, a.user);
  } catch (e) {
    if (String(e.message).includes(' 404 ')) throw new Error(`no AI credit usage found for ${a.org} ${a.year}-${a.month} (404) — check the org, month, and that the org has AI credit billing`);
    throw e;
  }
  console.log(renderCredits(data, `org: ${a.org}`, a.year, a.month));
  if (a['json-file']) writeFileSync(a['json-file'], JSON.stringify(data, null, 2));
}

async function main() {
  const sub = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
  if (sub === 'reconcile') return reconcileMain();
  if (sub === 'credits') return creditsMain();
  if (sub) throw new Error(`unknown subcommand "${sub}" — use: reconcile | credits, or nothing for a report`);
  const args = parseCli();
  const cfg = loadConfig(args.config);
  if (args['no-coab']) cfg.coab = false;
  const since = new Date(Date.now() - args.days * 86_400_000);
  const token = args.token || process.env.GITHUB_TOKEN;

  let rep;
  let runsArr = null;
  if (args['fixture-dir']) {
    const dir = args['fixture-dir'];
    let runs = JSON.parse(readFileSync(`${dir}/runs.json`, 'utf8'));
    const jobsByRun = new Map(runs.map(r => [r.id, r.jobs || []]));
    runs = runs.filter(r => !r.created_at || new Date(r.created_at) >= since).slice(0, args['max-runs']);
    runsArr = runs;
    rep = buildReport(args.repo || '(fixture)', runs, jobsByRun, cfg, args.days);
  } else if (args.org) {
    if (args['pr-comment']) throw new Error('--pr-comment works with --repo, not --org');
    const repos = await listOrgRepos(args.org, token, args.repos);
    if (!repos.length) throw new Error(`no repositories visible for ${args.org} — check the org/user name and token scope`);
    const reports = [];
    for (let i = 0; i < repos.length; i++) {
      const r = repos[i];
      const vis = await repoVisibility(r, token);
      const rr = await listRuns(r, since, token, args['max-runs']);
      if (!rr.length) continue;
      const jm = new Map();
      for (const run of rr) jm.set(run.id, await listJobs(r, run.id, token));
      const one = buildReport(r, rr, jm, cfg, args.days, vis);
      reports.push(one);
      if (!args.quiet) console.error(`  [${i + 1}/${repos.length}] ${r}: ${rr.length} runs, $${one.totalCost.toFixed(2)}`);
    }
    if (!reports.length) throw new Error(`no workflow runs in the last ${args.days} days across ${repos.length} most-recently-pushed repos of ${args.org}`);
    rep = buildOrgReport(args.org, reports);
  } else {
    if (!args.repo) throw new Error('--repo owner/name (or --org NAME, or GITHUB_REPOSITORY) required');
    const vis = await repoVisibility(args.repo, token);
    const runs = await listRuns(args.repo, since, token, args['max-runs']);
    runsArr = runs;
    const jobsByRun = new Map();
    let done = 0;
    for (const run of runs) {
      jobsByRun.set(run.id, await listJobs(args.repo, run.id, token));
      if (!args.quiet && ++done % 50 === 0) console.error(`  ...fetched jobs for ${done}/${runs.length} runs`);
    }
    rep = buildReport(args.repo, runs, jobsByRun, cfg, args.days, vis);
  }

  console.log(renderTable(rep));

  if (args['pr-comment']) {
    const n = args['pr-comment'] === 'auto'
      ? (process.env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//) || [])[1]
      : args['pr-comment'];
    if (!/^\d+$/.test(String(n))) {
      throw new Error(`--pr-comment: expected a PR number or "auto" (got "${args['pr-comment']}"; GITHUB_REF=${process.env.GITHUB_REF || 'unset'})`);
    }
    const pr = await gh(`/repos/${args.repo}/pulls/${n}`, token);
    const body = renderMarkdown(rep) + prSection(rep, runsArr, pr.head?.sha) + '\n<!-- costgrep report -->';
    const posted = await ghPost(`/repos/${args.repo}/issues/${n}/comments`, token, { body });
    console.error(`report posted to PR #${n}: ${posted.html_url}`);
  }

  if (args['slack-webhook']) {
    await postSlack(args['slack-webhook'], renderTable(rep));
    console.error('report posted to Slack');
  }

  if (args['json-file']) {
    writeFileSync(args['json-file'], JSON.stringify(rep, null, 2));
    console.error(`full report written to ${args['json-file']}`);
  }
  if (args['md-file']) {
    writeFileSync(args['md-file'], renderMarkdown(rep) + '\n');
    console.error(`markdown report written to ${args['md-file']}`);
  }
  if (args['csv-file']) {
    writeFileSync(args['csv-file'], renderCsv(rep));
    console.error(`job-level evidence CSV written to ${args['csv-file']}`);
  }
  if (args['gh-output']) {
    appendFileSync(args['gh-output'], Object.entries(outputsFor(rep)).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
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

export { classifyActor, jobMinutes, inferRate, buildReport, buildOrgReport, renderTable, renderMarkdown, renderCsv, outputsFor, visibilityNotice, coAuthoredByAgent, buildReconciliation, renderReconciliation, renderCredits, prSection, postSlack, monthBounds, prevMonth, DEFAULT_RATES, DEFAULT_AGENTS, DEFAULT_BOTS, DEFAULT_COAUTHORS, norm };

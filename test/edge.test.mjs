// Edge-case harness built into the suite: mock GitHub API on a local port via
// COSTGREP_API (the env hook that exists exactly for this kind of verification —
// no file patching needed). Verifies honest failure modes found by external
// review: hanging servers, garbage bodies, HTTP 500s, and crash-free error exits.
//
// NOTE: the CLI must be spawned ASYNC (not spawnSync) — a sync parent freezes the
// event loop, the mock server never responds, and every case degrades to a timeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'costgrep.mjs');

function runCli(handler, { timeoutMs = 1000, spawnTimeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const srv = createServer(handler);
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = spawn(process.execPath, [CLI, '--repo', 'mock/repo', '--days', '1'], {
        env: {
          ...process.env,
          COSTGREP_API: `http://127.0.0.1:${srv.address().port}`,
          COSTGREP_TIMEOUT_MS: String(timeoutMs),
          GITHUB_TOKEN: 'mock-token',
        },
      });
      let out = '', err = '';
      p.stdout.on('data', d => out += d);
      p.stderr.on('data', d => err += d);
      const killer = setTimeout(() => p.kill('SIGTERM'), spawnTimeout);
      p.on('exit', (code, signal) => {
        clearTimeout(killer);
        srv.close();
        srv.closeAllConnections?.();
        resolve({ code, signal, out, err });
      });
      p.on('error', e => { clearTimeout(killer); srv.close(); reject(e); });
    });
  });
}

test('hanging API (no response ever) -> honest timeout error, exit 1, no hang', async () => {
  const r = await runCli(() => { /* silence forever */ }, { timeoutMs: 1000 });
  assert.equal(r.code, 1, `code=${r.code} signal=${r.signal} err=${r.err}`);
  assert.match(r.err, /GitHub API timeout .*after 1s/);
});

test('stalled mid-stream body -> honest timeout error, exit 1', async () => {
  const r = await runCli((q, s) => {
    s.writeHead(200);
    s.write('{"total_count":1,"workflow_runs":[{"id":1,"created_at":"2026-10-03T00:00:00Z');
    // never ends
  }, { timeoutMs: 1000 });
  assert.equal(r.code, 1, `code=${r.code} err=${r.err}`);
  assert.match(r.err, /timeout/i);
});

test('garbage body -> honest JSON error, exit 1, no runtime crash', async () => {
  const r = await runCli((q, s) => { s.writeHead(200, { 'content-type': 'application/json' }); s.end('<html>NOT JSON</html>'); });
  assert.equal(r.code, 1, `code=${r.code} signal=${r.signal} err=${r.err}`);
  assert.match(r.err, /error: /);
  assert.ok(!r.signal, `crashed: ${r.signal}`);
});

test('HTTP 500 -> honest error with status, exit 1', async () => {
  const r = await runCli((q, s) => { s.writeHead(500); s.end('{"message":"boom"}'); });
  assert.equal(r.code, 1, `code=${r.code} err=${r.err}`);
  assert.match(r.err, /GitHub API 500/);
});

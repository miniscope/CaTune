#!/usr/bin/env node
// Boot the Vite dev server, verify that SharedArrayBuffer is usable in
// the served page (the COOP/COEP headers are working), then shut the
// server down and exit 0. Used as a smoke check for design §13's
// requirement that cross-origin isolation is in place before any
// SAB-using worker code lands.
//
// No-deps implementation: start Vite, fetch `/`, check the response
// headers for `cross-origin-opener-policy: same-origin` and
// `cross-origin-embedder-policy: require-corp`. We don't evaluate the
// page — just assert the headers the browser needs are present.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const HEADER_COOP = 'cross-origin-opener-policy';
const HEADER_COEP = 'cross-origin-embedder-policy';
const EXPECTED_COOP = 'same-origin';
const EXPECTED_COEP = 'require-corp';
const STARTUP_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 5_000;

const appDir = resolve(import.meta.dirname, '..');

function parseVitePort(stdoutLine) {
  // Vite prints: "  ➜  Local:   http://localhost:5173/"
  const match = stdoutLine.match(/http:\/\/localhost:(\d+)/);
  return match ? Number(match[1]) : null;
}

const vite = spawn('npx', ['vite', '--port', '0'], {
  cwd: appDir,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let port = null;
const startup = new Promise((resolvePort, rejectPort) => {
  const to = setTimeout(
    () => rejectPort(new Error(`vite did not print a local URL within ${STARTUP_TIMEOUT_MS} ms`)),
    STARTUP_TIMEOUT_MS,
  );
  vite.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[vite] ${text}`);
    for (const line of text.split('\n')) {
      const p = parseVitePort(line);
      if (p !== null && port === null) {
        port = p;
        clearTimeout(to);
        resolvePort(p);
      }
    }
  });
  vite.stderr.on('data', (chunk) => process.stderr.write(`[vite-err] ${chunk}`));
  vite.on('exit', (code) => {
    if (port === null) {
      clearTimeout(to);
      rejectPort(new Error(`vite exited with code ${code} before reporting a port`));
    }
  });
});

function shutdown(code) {
  vite.kill('SIGTERM');
  process.exit(code);
}

try {
  await startup;
  // Small delay: the URL is logged right before the server accepts
  // connections. A one-shot timeout avoids racing that window.
  await new Promise((r) => setTimeout(r, 250));

  const controller = new AbortController();
  const ft = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(`http://localhost:${port}/`, { signal: controller.signal });
  clearTimeout(ft);

  const coop = res.headers.get(HEADER_COOP);
  const coep = res.headers.get(HEADER_COEP);

  if (coop !== EXPECTED_COOP) {
    console.error(`[verify-sab] expected ${HEADER_COOP}=${EXPECTED_COOP}, got ${coop}`);
    shutdown(1);
  }
  if (coep !== EXPECTED_COEP) {
    console.error(`[verify-sab] expected ${HEADER_COEP}=${EXPECTED_COEP}, got ${coep}`);
    shutdown(1);
  }

  console.log(
    '[verify-sab] COOP/COEP headers present on dev server — SharedArrayBuffer will be available.',
  );
  shutdown(0);
} catch (e) {
  console.error('[verify-sab] failed:', e);
  shutdown(1);
}

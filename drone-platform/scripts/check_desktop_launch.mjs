// Phase 0 requires a real desktop launch, not a compiled artifact. This harness starts the
// shipped binary through WebDriver, drives the window an operator would use, restarts the
// application against the same data directory, and records what each run actually observed.
// It never writes application state itself: every assertion reads the running window.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runDir = path.join(root, 'logs', `launch-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const homeDir = path.join(runDir, 'home');
const dataDir = path.join(homeDir, 'dev.dronelab.desktop');
const shotDir = path.join(runDir, 'screenshots');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checks = [];
const processes = [];
const report = {
  recordedAt: new Date().toISOString(),
  scope: 'Phase 0 desktop launch verification',
  host: { platform: process.platform, release: os.release(), node: process.version },
  binary: null, display: null, dataDirectory: path.relative(root, dataDir),
  screenshots: [], checks, sessionLogs: [], passed: false, failure: null,
  note: 'Evidence covers the desktop application only. It proves no hardware, firmware or flight capability.',
};
function record(name, passed, detail) {
  checks.push({ name, passed, detail, observedAt: new Date().toISOString() });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) throw new Error(`${name}: ${detail}`);
}

function binary() {
  for (const profile of ['release', 'debug']) {
    const candidate = path.join(root, 'target', profile, 'dronelab-desktop');
    if (fs.existsSync(candidate)) return { path: candidate, profile };
  }
  throw new Error('No desktop binary. Run npm run desktop:build first.');
}

function tool(name) {
  const found = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : null;
}

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

async function freePort(start) {
  for (let port = start; port < start + 200; port += 1) if (await portFree(port)) return port;
  throw new Error('No free TCP port for the WebDriver bridge');
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portFree(port))) return;
    await sleep(200);
  }
  throw new Error(`Nothing accepted connections on port ${port}`);
}

function track(name, child, logPath) {
  const stream = fs.createWriteStream(logPath);
  child.stdout?.pipe(stream);
  child.stderr?.pipe(stream);
  child.on('error', (error) => console.error(`${name} could not start: ${error.message}`));
  processes.push({ name, child });
  return child;
}

// A headless host has no display, and Tauri cannot map a window without one. Xvfb is a
// display, not a substitute runtime: the binary, GTK, WebKit and the IPC bridge are real.
async function startDisplay() {
  if (process.env.DISPLAY) return { display: process.env.DISPLAY, provider: 'inherited' };
  if (!tool('Xvfb')) throw new Error('No DISPLAY and Xvfb is not installed. See docs/installation.md.');
  for (let number = 99; number < 130; number += 1) {
    if (fs.existsSync(`/tmp/.X11-unix/X${number}`)) continue;
    const child = track('Xvfb', spawn('Xvfb', [`:${number}`, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'],
      { stdio: ['ignore', 'pipe', 'pipe'] }), path.join(runDir, 'xvfb.log'));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await sleep(100);
      if (fs.existsSync(`/tmp/.X11-unix/X${number}`)) return { display: `:${number}`, provider: `Xvfb ${child.pid}` };
      if (child.exitCode !== null) break;
    }
  }
  throw new Error('Xvfb did not provide a display');
}

class Session {
  constructor(base, id) { this.base = base; this.id = id; }

  // tauri-driver starts the native WebDriver alongside itself and proxies to it without
  // waiting, so the first session can arrive before that socket accepts. Retry the
  // handshake; a driver that is genuinely absent still fails, it just fails later.
  static async open(base, application, environment) {
    const options = { application, args: [], env: environment };
    const body = {
      capabilities: { alwaysMatch: { 'tauri:options': options }, firstMatch: [{}] },
      desiredCapabilities: { 'tauri:options': options },
    };
    let last = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const value = await request(base, 'POST', '/session', body);
        return new Session(base, value.sessionId ?? value.capabilities?.sessionId);
      } catch (error) {
        last = error;
        console.log(`  session handshake attempt ${attempt} failed (${error.message}); retrying`);
        await sleep(2000);
      }
    }
    throw new Error(`The application never accepted a WebDriver session: ${last?.message}`);
  }

  run(script, args = []) { return request(this.base, 'POST', `/session/${this.id}/execute/sync`, { script, args }); }
  async screenshot(name) {
    const value = await request(this.base, 'GET', `/session/${this.id}/screenshot`);
    const file = path.join(shotDir, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(value, 'base64'));
    return path.relative(root, file);
  }
  close() { return request(this.base, 'DELETE', `/session/${this.id}`).catch(() => null); }

  // The window renders asynchronously. Poll the real DOM rather than assuming a fixed delay,
  // and surface the last observed state so a failure says what the operator would have seen.
  async until(label, predicate, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      last = await this.run(READ_STATE);
      if (last.error) throw new Error(`The application reported an error: ${last.error}`);
      if (predicate(last)) return last;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}. Last observed: ${JSON.stringify(last)}`);
  }
}

async function request(base, method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload?.value && payload.value.error)) {
    throw new Error(`WebDriver ${method} ${route}: ${payload?.value?.message ?? payload?.value?.error ?? response.status}`);
  }
  return payload.value;
}

const READ_STATE = `return {
  loading: Boolean(document.querySelector('.loading-panel')),
  runtime: (document.querySelector('.statusbar')?.innerText ?? '').replace(/\\s+/g, ' ').trim(),
  safety: (document.querySelector('.connection-status')?.innerText ?? '').replace(/\\s+/g, ' ').trim().toLowerCase(),
  preview: Boolean(document.querySelector('.preview-banner')),
  page: (document.querySelector('.breadcrumbs strong')?.innerText ?? '').trim(),
  projects: [...document.querySelectorAll('.project-row strong')].map(node => node.innerText.trim()),
  active: (document.querySelector('.overview-item:nth-child(2) .overview-text')?.innerText ?? '').replace(/\\s+/g, ' ').trim(),
  snapshots: [...document.querySelectorAll('.snapshot-row strong')].map(node => node.innerText.trim()),
  dialog: Boolean(document.querySelector('.project-dialog')),
  error: (document.querySelector('.message-banner.error')?.innerText ?? '').trim(),
  notice: (document.querySelector('.message-banner.success')?.innerText ?? '').trim(),
};`;

const CLICK_TEXT = `const [selector, text] = arguments;
const target = [...document.querySelectorAll(selector)]
  .find(node => !node.disabled && node.innerText.toLowerCase().includes(text.toLowerCase()));
if (!target) return false;
target.click();
return true;`;

const CLICK = `const target = document.querySelector(arguments[0]);
if (!target || target.disabled) return false;
target.click();
return true;`;

// React owns these inputs, so assigning .value directly would be discarded on the next
// render. Use the prototype setter the way a keystroke does, then dispatch the event.
const FILL = `const [selector, value] = arguments;
const field = document.querySelector(selector);
if (!field) return false;
const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
field.dispatchEvent(new Event('input', { bubbles: true }));
return true;`;

async function click(session, selector, text) {
  const clicked = text === undefined ? await session.run(CLICK, [selector]) : await session.run(CLICK_TEXT, [selector, text]);
  if (!clicked) throw new Error(`No enabled element matched ${selector}${text ? ` containing "${text}"` : ''}`);
}

async function fill(session, selector, value) {
  if (!(await session.run(FILL, [selector, value]))) throw new Error(`No field matched ${selector}`);
}

function sessionEvents() {
  const logRoot = path.join(dataDir, 'logs');
  if (!fs.existsSync(logRoot)) return [];
  return fs.readdirSync(logRoot).sort().map((directory) => {
    const file = path.join(logRoot, directory, 'application.jsonl');
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
    return { directory, events: lines.map((line) => JSON.parse(line)) };
  });
}

const projectName = `Launch verification ${new Date().toISOString().slice(0, 19)}`;
const snapshotLabel = 'Launch verification snapshot';

// First launch: an empty data directory, a real window, and every write made through the UI.
async function firstLaunch(base, environment) {
  const session = await Session.open(base, report.binary.path, environment);
  try {
    const opened = await session.until('the workspace to open', (state) => !state.loading && state.runtime.length > 0, 60_000);
    record('desktop_launch', opened.runtime.length > 0 && !opened.loading,
      `${report.binary.profile} binary rendered its window on ${report.display.display} (${report.display.provider})`);
    record('native_runtime', opened.runtime.includes('Native desktop runtime') && !opened.preview,
      `status bar reports "${opened.runtime}"`);
    record('default_safety_state', opened.safety === 'disconnected',
      `safety state is "${opened.safety}" with no hardware connected`);
    record('empty_workspace', opened.projects.length === 0, 'a new data directory lists no projects');

    await click(session, '.button.primary', 'New project');
    await session.until('the project dialog', (state) => state.dialog);
    await fill(session, '.project-dialog .field input', projectName);
    await fill(session, '.project-dialog textarea', 'Created by the Phase 0 launch verification harness.');
    await click(session, '.project-dialog button[type=submit]');
    const created = await session.until('the created project', (state) => !state.dialog && state.projects.includes(projectName));
    record('create_project', created.active.includes(projectName), `"${projectName}" is the active airframe`);

    await click(session, '.nav-item', 'Configure');
    await session.until('the configuration workspace', (state) => state.page === 'Configure');
    await fill(session, '.snapshot-form .field input', snapshotLabel);
    await fill(session, '.snapshot-form textarea', '{"looptime": 125, "gyro_lpf": "off", "blackbox_enabled": true}');
    await click(session, '.snapshot-form button[type=submit]');
    const saved = await session.until('the saved snapshot', (state) => state.snapshots.includes(snapshotLabel));
    record('save_snapshot', saved.notice.length > 0, `snapshot stored; the window reports "${saved.notice}"`);

    await click(session, '.safety-button');
    const stopped = await session.until('the emergency stop', (state) => state.safety === 'emergency stop');
    record('emergency_stop_latches', stopped.safety === 'emergency stop', 'the operator lock engaged in the running application');
    report.screenshots.push(await session.screenshot('01-first-launch-emergency-stop'));
  } finally {
    await session.close();
  }
}

// Second launch: the same data directory. Nothing is seeded, so anything present here
// was persisted by the first run and reloaded by the application on startup.
async function secondLaunch(base, environment) {
  const session = await Session.open(base, report.binary.path, environment);
  try {
    const reopened = await session.until('the reopened workspace', (state) => !state.loading && state.runtime.length > 0, 60_000);
    record('project_survives_restart', reopened.projects.includes(projectName),
      `"${projectName}" was reloaded from SQLite after the application exited`);
    record('selection_survives_restart', reopened.active.includes(projectName), 'the selected project was restored');
    record('emergency_stop_survives_restart', reopened.safety === 'emergency stop',
      'the latched stop was reloaded; startup did not clear it');

    await click(session, '.nav-item', 'Configure');
    const history = await session.until('the snapshot history', (state) => state.page === 'Configure' && state.snapshots.length > 0);
    record('snapshot_survives_restart', history.snapshots.includes(snapshotLabel),
      `configuration history holds ${history.snapshots.length} revision(s)`);

    await click(session, '.safety-button');
    const cleared = await session.until('the explicit reset', (state) => state.safety === 'disconnected');
    record('explicit_reset_required', cleared.safety === 'disconnected',
      'the stop cleared only after an explicit operator action');
    report.screenshots.push(await session.screenshot('02-restart-reset'));
  } finally {
    await session.close();
  }
}

async function main() {
  for (const directory of [runDir, homeDir, shotDir]) fs.mkdirSync(directory, { recursive: true });
  report.binary = binary();
  const driverPath = tool('tauri-driver') ?? path.join(os.homedir(), '.cargo', 'bin', 'tauri-driver');
  if (!fs.existsSync(driverPath)) throw new Error('tauri-driver is not installed. Run: cargo install tauri-driver --locked');
  if (!tool('WebKitWebDriver')) throw new Error('WebKitWebDriver is not installed. See docs/installation.md.');

  report.display = await startDisplay();
  const port = await freePort(4444);
  const nativePort = await freePort(port + 1);
  const environment = {
    DISPLAY: report.display.display,
    XDG_DATA_HOME: homeDir, XDG_CONFIG_HOME: path.join(runDir, 'config'), XDG_CACHE_HOME: path.join(runDir, 'cache'),
    // Container graphics stacks have no GPU compositor; WebKit must fall back to software.
    WEBKIT_DISABLE_COMPOSITING_MODE: '1', WEBKIT_DISABLE_DMABUF_RENDERER: '1', LIBGL_ALWAYS_SOFTWARE: '1',
  };
  track('tauri-driver', spawn(driverPath, ['--port', String(port), '--native-port', String(nativePort)],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...environment } }), path.join(runDir, 'tauri-driver.log'));
  await waitForPort(port, 20_000);
  await sleep(1500);
  const base = `http://127.0.0.1:${port}`;

  await firstLaunch(base, environment);
  await sleep(1000);
  await secondLaunch(base, environment);

  const database = path.join(dataDir, 'dronelab.sqlite3');
  const databaseSize = fs.existsSync(database) ? fs.statSync(database).size : 0;
  record('sqlite_database_written', databaseSize > 0, `${path.relative(root, database)} holds ${databaseSize} bytes`);
  report.sessionLogs = sessionEvents().map((log) => ({
    directory: log.directory, events: log.events.length,
    operations: [...new Set(log.events.map((event) => event.operation))],
  }));
  const launches = report.sessionLogs.filter((log) => log.operations.includes('application_start'));
  record('session_logs_per_launch', launches.length === 2,
    `${launches.length} independent run log(s) recorded application_start`);
  report.passed = true;
}

try {
  await main();
} catch (error) {
  report.failure = error.message;
  console.error(`\nDesktop launch verification failed: ${report.failure}`);
} finally {
  for (const { child } of [...processes].reverse()) { try { child.kill('SIGTERM'); } catch { /* already exited */ } }
  await sleep(500);
  for (const { child } of processes) { try { child.kill('SIGKILL'); } catch { /* already exited */ } }
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'launch.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.passed ? 'PASS' : 'FAIL'} desktop launch verification`);
  console.log(`Launch evidence: ${runDir}`);
  process.exitCode = report.passed ? 0 : 1;
}

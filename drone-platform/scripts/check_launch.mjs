import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runDir = path.join(root, 'logs', `launch-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const identifier = JSON.parse(fs.readFileSync(path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8')).identifier;

// The launch must be observed against a throwaway data directory, never the operator's
// real workspace. Tauri resolves app_data_dir from these per-platform roots, so
// redirecting them isolates the run without the application knowing.
const dataHomeVariable = { linux: 'XDG_DATA_HOME', win32: 'APPDATA', darwin: 'HOME' }[process.platform];
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dronelab-launch-'));
const dataDirectory = path.join(dataRoot, process.platform === 'darwin' ? 'Library/Application Support' : '', identifier);

function locateBinary() {
  if (process.env.DRONELAB_BINARY) return process.env.DRONELAB_BINARY;
  const name = process.platform === 'win32' ? 'dronelab-desktop.exe' : 'dronelab-desktop';
  return ['release', 'debug'].map((profile) => path.join(root, 'target', profile, name)).find((candidate) => fs.existsSync(candidate));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch(attempt) {
  const process_ = spawn(binary, [], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, [dataHomeVariable]: dataRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let exited = null;
  process_.stdout.on('data', (chunk) => { stdout += chunk; });
  process_.stderr.on('data', (chunk) => { stderr += chunk; });
  process_.on('exit', (code, signal) => { exited = { code, signal }; });

  // The window layer initialises asynchronously; wait for the artifacts a completed
  // startup must have written rather than for a fixed duration.
  const database = path.join(dataDirectory, 'dronelab.sqlite3');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !exited && !(fs.existsSync(database) && sessionLogs().length >= attempt)) await sleep(200);
  const startupObserved = fs.existsSync(database) && sessionLogs().length >= attempt;
  // Give the process a moment to settle so a crash immediately after writing is still caught.
  if (startupObserved && !exited) await sleep(1_000);

  const survivedStartup = !exited;
  if (!exited) {
    process_.kill('SIGTERM');
    const killDeadline = Date.now() + 5_000;
    while (Date.now() < killDeadline && !exited) await sleep(100);
    if (!exited) process_.kill('SIGKILL');
    while (!exited) await sleep(100);
  }
  fs.writeFileSync(path.join(runDir, `launch-${attempt}.stdout.log`), stdout);
  fs.writeFileSync(path.join(runDir, `launch-${attempt}.stderr.log`), stderr);
  return { attempt, startupObserved, survivedStartup, exit: exited };
}

function sessionLogs() {
  const directory = path.join(dataDirectory, 'logs');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((entry) => fs.existsSync(path.join(directory, entry, 'application.jsonl')));
}

// A launch that never provisioned storage must still produce a readable failure report,
// so an unusable database is a recorded result rather than a crash.
function inspectDatabase() {
  const file = path.join(dataDirectory, 'dronelab.sqlite3');
  if (!fs.existsSync(file)) return { available: false, reason: 'no database was created' };
  let database;
  try {
    database = new DatabaseSync(file, { readOnly: true });
    const one = (sql) => Object.values(database.prepare(sql).get() ?? {})[0];
    return {
      available: true,
      schemaVersion: one('PRAGMA user_version'),
      migrationsApplied: one('SELECT count(*) FROM migration_history'),
      safetyState: one('SELECT state FROM safety_status WHERE singleton = 1'),
      startupEvents: one("SELECT count(*) FROM audit_events WHERE operation = 'application_start'"),
      projects: one('SELECT count(*) FROM projects'),
    };
  } catch (error) {
    return { available: false, reason: error.message };
  } finally {
    database?.close();
  }
}

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

fs.mkdirSync(runDir, { recursive: true });
const binary = locateBinary();
if (!binary) {
  console.error('BLOCKED: no DroneLab binary found. Run npm run desktop:build first, or set DRONELAB_BINARY.');
  fs.writeFileSync(path.join(runDir, 'evidence.json'), `${JSON.stringify({
    recordedAt: new Date().toISOString(), scope: 'Phase 0 native launch', blocked: true,
    reason: 'The desktop binary has not been built on this host.', desktopLaunchVerified: false,
  }, null, 2)}\n`);
  fs.rmSync(dataRoot, { recursive: true, force: true });
  process.exit(1);
}

// Two launches: the first must provision storage, the second must reopen it. A restart that
// silently re-migrated or discarded the workspace would fail the Phase 0 persistence gate.
function launchDetail(result) {
  if (!result.survivedStartup) return `process exited early: ${JSON.stringify(result.exit)}`;
  if (!result.startupObserved) return 'process stayed running but wrote no database or session log within 30s';
  return undefined;
}
const first = await launch(1);
record('first launch starts and provisions storage', first.startupObserved && first.survivedStartup, launchDetail(first));
const second = await launch(2);
record('relaunch starts against existing storage', second.startupObserved && second.survivedStartup, launchDetail(second));

const database = inspectDatabase();
const unreadable = database.available ? undefined : database.reason;
record('schema is at the current version', database.schemaVersion === 2, unreadable ?? `user_version=${database.schemaVersion}`);
record('migrations applied once, not repeated on restart', database.migrationsApplied === 2, unreadable ?? `migration_history=${database.migrationsApplied}`);
record('safety defaults to DISCONNECTED', database.safetyState === 'DISCONNECTED', unreadable ?? `state=${database.safetyState}`);
record('each launch is audited', database.startupEvents === 2, unreadable ?? `application_start rows=${database.startupEvents}`);

const sessions = sessionLogs();
record('each launch retains its own session log', sessions.length === 2, `session directories=${sessions.length}`);
let startupLogged = sessions.length > 0;
let logFailure;
for (const session of sessions) {
  try {
    const lines = fs.readFileSync(path.join(dataDirectory, 'logs', session, 'application.jsonl'), 'utf8').trim().split('\n');
    if (!(lines.length > 0 && JSON.parse(lines[0]).operation === 'application_start')) startupLogged = false;
  } catch (error) {
    startupLogged = false;
    logFailure = error.message;
  }
}
record('session logs record the startup event', startupLogged, logFailure ?? (sessions.length ? undefined : 'no session log was written'));

const passed = results.every((result) => result.passed);
const report = {
  recordedAt: new Date().toISOString(), scope: 'Phase 0 native launch',
  binary, identifier, isolatedDataDirectory: dataDirectory,
  display: { DISPLAY: process.env.DISPLAY ?? null, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? null },
  launches: [first, second], database, sessionLogDirectories: sessions.length, checks: results,
  desktopLaunchVerified: passed,
  note: 'Proves the native runtime launches, migrates storage, latches safety defaults and reopens an existing workspace across a restart. It does not exercise operator-driven project creation through the user interface, and it makes no hardware or simulation claim.',
};
fs.writeFileSync(path.join(runDir, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.rmSync(dataRoot, { recursive: true, force: true });
console.log(`Evidence: ${runDir}`);
if (!passed) process.exitCode = 1;

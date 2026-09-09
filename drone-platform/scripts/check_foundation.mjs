import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runDir = path.join(root, 'logs', `foundation-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(runDir, { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this checker using npm run check:foundation.');
const checks = [];
for (const script of ['typecheck', 'test', 'build']) {
  const startedAt = new Date().toISOString();
  const outcome = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180_000,
  });
  const log = `${outcome.stdout ?? ''}${outcome.stderr ?? ''}${outcome.error?.message ?? ''}`;
  fs.writeFileSync(path.join(runDir, `${script}.log`), log);
  const check = { name: script, startedAt, finishedAt: new Date().toISOString(), exitCode: outcome.status,
    passed: !outcome.error && outcome.status === 0 };
  checks.push(check);
  console.log(`${check.passed ? 'PASS' : 'FAIL'} ${script}`);
  if (!check.passed) console.error(log);
}

// A missing GTK/WebKit stack blocks only the desktop shell. The core native suite is run
// separately so storage and safety evidence is not lost behind an unbuildable window layer.
function cargoTest(name, extraArgs) {
  const args = ['test', '--workspace', ...extraArgs];
  if (fs.existsSync(path.join(root, 'Cargo.lock'))) args.push('--locked');
  const outcome = spawnSync('cargo', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 900_000 });
  const log = `${outcome.stdout ?? ''}${outcome.stderr ?? ''}${outcome.error?.message ?? ''}`;
  fs.writeFileSync(path.join(runDir, `${name}.log`), log);
  const cargoMissing = outcome.error?.code === 'ENOENT';
  const librariesMissing = /The system library `[^`]+` required by crate/.test(log);
  const passed = !outcome.error && outcome.status === 0;
  const status = passed ? 'PASS' : cargoMissing || librariesMissing ? 'BLOCKED' : 'FAIL';
  console.log(`${status} ${name}`);
  if (status === 'FAIL') console.error(log);
  return { name, command: `cargo ${args.join(' ')}`, passed, blocked: !passed && status === 'BLOCKED',
    cargoMissing, librariesMissing, exitCode: outcome.status };
}

const coreTests = cargoTest('native-core', ['--no-default-features']);
const desktopTests = cargoTest('native-desktop', []);
if (desktopTests.librariesMissing) {
  console.error('BLOCKED: the desktop shell cannot be compiled on this host. See docs/installation.md.');
}

const report = {
  recordedAt: new Date().toISOString(), scope: 'Phase 0 automated foundation checks',
  versions: { node: process.version, npm: process.env.npm_config_user_agent ?? 'unknown' },
  checks,
  nativeTests: coreTests,
  desktopTests,
  desktopBuildVerified: desktopTests.passed,
  desktopLaunchVerified: false,
  phase0Complete: false,
  note: 'Automated checks alone do not prove desktop launch, hardware integration, or flight readiness.',
};
fs.writeFileSync(path.join(runDir, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Evidence: ${runDir}`);
if (checks.some((check) => !check.passed) || !coreTests.passed || !desktopTests.passed) process.exitCode = 1;

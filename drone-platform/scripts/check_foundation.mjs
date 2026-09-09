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

const nativeArgs = ['test', '--workspace'];
if (fs.existsSync(path.join(root, 'Cargo.lock'))) nativeArgs.push('--locked');
const nativeCheck = spawnSync('cargo', nativeArgs, {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 300_000,
});
const nativeUnavailable = nativeCheck.error?.code === 'ENOENT';
const nativePassed = !nativeCheck.error && nativeCheck.status === 0;
fs.writeFileSync(path.join(runDir, 'native.log'), `${nativeCheck.stdout ?? ''}${nativeCheck.stderr ?? ''}${nativeCheck.error?.message ?? ''}`);
console.log(`${nativeUnavailable ? 'BLOCKED' : nativePassed ? 'PASS' : 'FAIL'} native Rust tests`);
const report = {
  recordedAt: new Date().toISOString(), scope: 'Phase 0 automated foundation checks',
  versions: { node: process.version, npm: process.env.npm_config_user_agent ?? 'unknown' },
  checks, nativeTests: { passed: nativePassed, unavailable: nativeUnavailable, exitCode: nativeCheck.status },
  desktopLaunchVerified: false,
  phase0Complete: false,
  note: 'Automated checks alone do not prove desktop launch, hardware integration, or flight readiness.',
};
fs.writeFileSync(path.join(runDir, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Evidence: ${runDir}`);
if (checks.some((check) => !check.passed) || !nativePassed) process.exitCode = 1;

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runDir = path.join(root, 'logs', `environment-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(runDir, { recursive: true });

function command(executable, args = ['--version']) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  return {
    available: !result.error && result.status === 0,
    exitCode: result.status,
    output: (result.error?.message ?? `${result.stdout ?? ''}${result.stderr ?? ''}`).replace(/\0/g, '').trim(),
  };
}

const commands = {};
for (const name of ['git', 'cargo', 'rustc', 'python', 'cmake', 'gcc', 'docker', 'gz']) commands[name] = command(name);
commands.ros2 = command('ros2', ['--help']);
if (process.platform === 'win32') {
  commands.wsl = command('wsl', ['--status']);
  const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const compiler = command(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']);
  commands.msvc = { ...compiler, available: compiler.available && compiler.output.length > 0 };
}

const disk = fs.statfsSync(root);
const result = {
  checkedAt: new Date().toISOString(),
  os: { platform: os.platform(), version: os.version(), release: os.release(), architecture: os.arch() },
  cpu: { model: os.cpus()[0]?.model ?? 'unknown', logicalProcessors: os.availableParallelism() },
  ramGiB: Math.round(os.totalmem() / 2 ** 30 * 100) / 100,
  diskFreeGiB: Math.round(disk.bavail * disk.bsize / 2 ** 30 * 100) / 100,
  display: { DISPLAY: process.env.DISPLAY ?? null, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? null,
    note: process.platform === 'win32' ? 'Native desktop; GPU availability not probed.' : 'Environment values only; rendering not verified.' },
  node: process.version, commands,
  nativeToolchainPresent: commands.cargo.available && commands.rustc.available && (process.platform !== 'win32' || commands.msvc.available),
  simulationRuntimeVerified: false,
};
const report = path.join(runDir, 'environment.json');
fs.writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
console.log(`Environment evidence: ${report}`);
if (!result.nativeToolchainPresent) {
  console.error('BLOCKED: native toolchain is incomplete. See docs/installation.md before building the desktop runtime.');
  process.exitCode = 1;
}

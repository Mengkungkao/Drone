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
// Distributions that ship only the versioned interpreter must not be reported as lacking Python.
if (!commands.python.available) commands.python = command('python3');
if (process.platform === 'win32') {
  commands.wsl = command('wsl', ['--status']);
  const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const compiler = command(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']);
  commands.msvc = { ...compiler, available: compiler.available && compiler.output.length > 0 };
}

// Tauri links the GTK/WebKit desktop shell at build time. A working cargo does not prove
// the desktop app can be compiled, so the Linux gate must probe the system libraries too.
const desktopLibraryNames = process.platform === 'linux'
  ? ['glib-2.0', 'gtk+-3.0', 'gdk-3.0', 'libsoup-3.0', 'javascriptcoregtk-4.1', 'webkit2gtk-4.1', 'librsvg-2.0']
  : [];
const desktopLibraries = {};
for (const name of desktopLibraryNames) {
  const probe = command('pkg-config', ['--modversion', name]);
  desktopLibraries[name] = { available: probe.available, version: probe.available ? probe.output : null };
}
const missingLibraries = Object.entries(desktopLibraries).filter(([, library]) => !library.available).map(([name]) => name);

const disk = fs.statfsSync(root);
const result = {
  checkedAt: new Date().toISOString(),
  os: { platform: os.platform(), version: os.version(), release: os.release(), architecture: os.arch() },
  cpu: { model: os.cpus()[0]?.model ?? 'unknown', logicalProcessors: os.availableParallelism() },
  ramGiB: Math.round(os.totalmem() / 2 ** 30 * 100) / 100,
  diskFreeGiB: Math.round(disk.bavail * disk.bsize / 2 ** 30 * 100) / 100,
  display: { DISPLAY: process.env.DISPLAY ?? null, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY ?? null,
    note: process.platform === 'win32' ? 'Native desktop; GPU availability not probed.' : 'Environment values only; rendering not verified.' },
  node: process.version, commands, desktopLibraries,
  rustToolchainPresent: commands.cargo.available && commands.rustc.available,
  nativeToolchainPresent: commands.cargo.available && commands.rustc.available
    && (process.platform !== 'win32' || commands.msvc.available)
    && missingLibraries.length === 0,
  simulationRuntimeVerified: false,
};
const report = path.join(runDir, 'environment.json');
fs.writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
console.log(`Environment evidence: ${report}`);
if (!result.nativeToolchainPresent) {
  console.error('BLOCKED: native toolchain is incomplete. See docs/installation.md before building the desktop runtime.');
  if (missingLibraries.length > 0) {
    console.error(`Missing desktop libraries: ${missingLibraries.join(', ')}`);
    console.error('Operator action (requires elevation; DroneLab does not run it):');
    console.error('  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \\');
    console.error('    libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev build-essential');
  }
  process.exitCode = 1;
}

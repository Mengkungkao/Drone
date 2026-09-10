// Both launch gates start the real desktop binary, and Tauri cannot create a window
// without a display. Rather than each gate solving that differently, they share this:
// use the operator's display when there is one, and provide a virtual one when there
// is not. A virtual display is still a display — the binary, GTK, WebKit, the IPC
// bridge and SQLite are the shipped ones, and nothing here substitutes for them.
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function locateTool(name) {
  const found = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : null;
}

/**
 * Resolves a usable display. Returns the display name, how it was obtained, any extra
 * environment the child needs, and a stop() the caller must call when finished.
 */
export async function startDisplay(logPath) {
  const inherited = process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY;
  if (inherited) return { display: process.env.DISPLAY ?? null, provider: 'inherited', env: {}, stop() {} };
  // Windows and macOS draw without an X display; only Linux needs one provided.
  if (process.platform !== 'linux') return { display: null, provider: 'platform default', env: {}, stop() {} };
  if (!locateTool('Xvfb')) throw new Error('No DISPLAY and Xvfb is not installed. See docs/installation.md.');

  for (let number = 99; number < 130; number += 1) {
    if (fs.existsSync(`/tmp/.X11-unix/X${number}`)) continue;
    const child = spawn('Xvfb', [`:${number}`, '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    if (logPath) {
      const stream = fs.createWriteStream(logPath);
      child.stdout?.pipe(stream);
      child.stderr?.pipe(stream);
    }
    child.on('error', () => { /* reported by the caller's timeout below */ });
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await sleep(100);
      if (fs.existsSync(`/tmp/.X11-unix/X${number}`)) {
        return {
          display: `:${number}`,
          provider: `Xvfb ${child.pid}`,
          // A virtual display has no GPU compositor behind it, so WebKit must render in
          // software. These are only set for a display we provided: forcing them onto an
          // operator's real display would change how the application actually draws.
          env: { WEBKIT_DISABLE_COMPOSITING_MODE: '1', WEBKIT_DISABLE_DMABUF_RENDERER: '1', LIBGL_ALWAYS_SOFTWARE: '1' },
          stop() { try { child.kill('SIGTERM'); } catch { /* already exited */ } },
        };
      }
      if (child.exitCode !== null) break;
    }
    try { child.kill('SIGKILL'); } catch { /* already exited */ }
  }
  throw new Error('Xvfb did not provide a display');
}

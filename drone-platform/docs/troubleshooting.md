# Troubleshooting

| Symptom | Action |
| --- | --- |
| Browser preview cannot save a project | SQLite belongs to the native runtime. Launch Tauri after native prerequisites are installed. |
| Rust or native desktop build unavailable | Run `npm run check:environment`; install the reported Rust/MSVC prerequisites manually. A successful frontend build does not clear this blocker. |
| `tauri: not found` during `desktop:build` | The shell exports `NODE_ENV=production`, so npm omitted the dev dependencies. Re-run `npm install --include=dev`. |
| `check:launch` reports no desktop binary | It launches an artifact rather than building one. Run `npm run desktop:build` first. |
| `check:launch` cannot reach a display | Install `xvfb`, or export a `DISPLAY` the harness can use. It never fabricates a launch result when neither exists. |
| `tauri-driver` or `WebKitWebDriver` missing | Install both as described in [installation](installation.md#launch-verification-prerequisites). Without them the launch gate fails rather than being skipped. |
| Phase gate fails in CI but passes locally | Download the run's `phase-gate-evidence` artifact. It holds the same `logs/` tree as a local run: screenshots of both windows, per-check records, driver logs and the isolated SQLite database. |
| Launch checks time out on the first window | Read `logs/launch-<timestamp>/tauri-driver.log` and the screenshots. A window that maps but never leaves the loading panel usually means the native workspace failed to open, which the running application reports in its error banner. |
| Adapter shows unavailable | This is an explicit capability state. Phase 0 does not connect to flight controllers. |
| PX4 script says Phase 1 is gated | Phase 1 now means the Betaflight read-only hardware slice. Historical `.state/phase1.json` cannot satisfy it. |
| PX4 runtime disabled | Vehicle identity and network isolation still require Phase 2 implementation. Keep the interlock false. |
| Unsupported Ubuntu or ROS distribution | Use Ubuntu 24.04 x86-64 and a fresh Jazzy shell. Do not source Humble-generated workspace output. |
| Setup exits 2 | It printed required manual system commands and stopped without elevation. Follow the official repository setup instructions and review the missing packages. |
| Source release mismatch | Preserve local work and reconcile PX4, its matching `px4_msgs`, and the documented DDS agent version. Never silently reset source checkouts. |
| MAVSDK unavailable | The subsystem checks `.venv`; a global Python package is not a substitute. |
| DDS or ROS timeout in a future run | Keep `dds.log` and `ros2.log`; verify real client/session identity, matching messages and sensor-data QoS. Topic names alone are insufficient. |
| Flight criterion fails | Preserve the complete run. Diagnose from timestamps and telemetry, create a new run, and retest without lowering thresholds. |

The inspected host is Ubuntu 24.04 without ROS 2, Gazebo, or Docker, so the simulation subsystem is unprovisioned. The desktop launch is verified there on a virtual display; GPU rendering, Windows and macOS are not. Earlier simulator preparation history does not verify this target, and no hardware, DDS, Gazebo, or flight PASS should be inferred from shell syntax, unit fixtures, or frontend compilation.

`scripts/stop.sh` is the retained process-group cleanup for managed PX4 runs. Review recorded run/process identity during Phase 2 hardening; never replace scoped cleanup with a broad system-wide process kill.

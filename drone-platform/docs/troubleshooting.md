# Troubleshooting

| Symptom | Action |
| --- | --- |
| Browser preview cannot save a project | SQLite belongs to the native runtime. Launch Tauri after native prerequisites are installed. |
| Rust or native desktop build unavailable | Run `npm run check:environment`; install the reported Rust/MSVC prerequisites manually. A successful frontend build does not clear this blocker. |
| Adapter shows unavailable | This is an explicit capability state. Phase 0 does not connect to flight controllers. |
| PX4 script says Phase 1 is gated | Phase 1 now means the Betaflight read-only hardware slice. Historical `.state/phase1.json` cannot satisfy it. |
| PX4 runtime disabled | Vehicle identity and network isolation still require Phase 2 implementation. Keep the interlock false. |
| Unsupported Ubuntu or ROS distribution | Use Ubuntu 24.04 x86-64 and a fresh Jazzy shell. Do not source Humble-generated workspace output. |
| Setup exits 2 | It printed required manual system commands and stopped without elevation. Follow the official repository setup instructions and review the missing packages. |
| Source release mismatch | Preserve local work and reconcile PX4, its matching `px4_msgs`, and the documented DDS agent version. Never silently reset source checkouts. |
| MAVSDK unavailable | The subsystem checks `.venv`; a global Python package is not a substitute. |
| DDS or ROS timeout in a future run | Keep `dds.log` and `ros2.log`; verify real client/session identity, matching messages and sensor-data QoS. Topic names alone are insufficient. |
| Flight criterion fails | Preserve the complete run. Diagnose from timestamps and telemetry, create a new run, and retest without lowering thresholds. |

The inspected host is Windows without WSL, ROS 2, Gazebo, or Docker. Earlier simulator preparation history does not verify this new target. No native launch, hardware, DDS, Gazebo, or flight PASS should be inferred from shell syntax, unit fixtures, or frontend compilation.

`scripts/stop.sh` is the retained process-group cleanup for managed PX4 runs. Review recorded run/process identity during Phase 2 hardening; never replace scoped cleanup with a broad system-wide process kill.

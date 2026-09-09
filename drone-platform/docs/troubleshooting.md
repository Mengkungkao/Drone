# Troubleshooting

* **Unsupported OS or ROS environment:** run the platform on Ubuntu 22.04 x86-64 with ROS 2 Humble. Open a fresh terminal if Jazzy or another ROS distribution was sourced; follow the [workspace migration steps](installation.md#rebuild-a-workspace-previously-used-with-jazzy) for old colcon output.
* **Fortress/Harmonic package conflict:** Humble's default `ros-humble-ros-gz` packages use Fortress. This project requires OSRF's `gz-harmonic` and `ros-humble-ros-gzharmonic`; see [compatibility](installation.md#gazebo-and-source-compatibility).
* **Source-version mismatch:** setup retains existing repositories. Preserve local edits, then reconcile PX4 with the selected released tag, `px4_msgs` with its matching `release/X.Y` branch, and Micro XRCE-DDS Agent with v2.4.2. Rebuild the workspace after changing message definitions.
* **MAVSDK missing from environment checks:** rerun setup as your regular user to populate the project-local virtual environment. An unrelated global Python installation does not satisfy this project's dependency check.
* **Package or clone HTTP errors:** outbound package/GitHub access is required. Do not mark versions verified or the environment ready until setup completes.
* **DDS timeout:** inspect `simulation.log`; PX4 must establish a real XRCE client session on loopback UDP 8888.
* **No ROS telemetry:** inspect `ros2.log`, verify matching `px4_msgs`, ROS domain settings, and sensor-data QoS. A topic listing alone is not proof.
* **Gazebo does not start headlessly:** inspect `px4.log`; confirm the checked-out release supports the official `gz_x500` target and Harmonic.
* **Flight failure:** preserve `test.log`, `altitude.csv`, and `evidence.json`. Do not lower thresholds. Fix the root cause, stop, create a new run, and retest.
* **Interrupted startup:** the ERR trap invokes scoped shutdown. If needed, run `scripts/stop.sh`; it never uses broad `pkill` for cleanup.

Known limitation: version discovery depends on available upstream network access. Phase 2 is not ready until Phase 1 has genuine runtime PASS evidence and should retain simulation as the default backend.

The current editing host is Windows without an available WSL Ubuntu environment. The earlier Ubuntu 24.04/Jazzy attempt was blocked by outbound repository HTTP 403 errors; that history does not verify the new Ubuntu 22.04/Humble target. Setup, build, DDS telemetry, and autonomous flight still need to run on the target system. No flight PASS is recorded or claimed by this migration.

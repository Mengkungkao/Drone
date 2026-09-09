# Simulation and flight test

On Ubuntu 22.04 with the Humble workspace built, run `scripts/start_sitl.sh` from `drone-platform`. It loads the Humble environment, creates a timestamped run directory, and starts the official `make px4_sitl gz_x500` workflow headlessly. Readiness gates require a live PX4 process/log signature, Gazebo process, DDS client-session log, and `TELEMETRY_VERIFIED` after five ROS local-position messages.

To inspect telemetry in another fresh terminal:

```bash
cd drone-platform
source /opt/ros/humble/setup.bash
source ros2_ws/install/setup.bash
ros2 run drone_monitor monitor
```

Run `scripts/test_phase1.sh` only after readiness. MAVSDK waits with bounded timeouts for connection and preflight health, then arms, takes off, holds, lands, and confirms disarm. Position samples are NED: north=`x`, east=`y`, down=`z`, and upward altitude is `-z`.

Use `scripts/stop.sh` even after a failed test. It reads the run's `pids` file, terminates children before parents, waits ten seconds, then force-stops only remaining recorded process groups.


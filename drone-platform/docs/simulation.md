# Simulation and flight test

Run `scripts/start_sitl.sh`. It creates a timestamped run directory and starts the official `make px4_sitl gz_x500` workflow headlessly. Readiness gates require a live PX4 process/log signature, Gazebo process, DDS client-session log, and `TELEMETRY_VERIFIED` after five ROS local-position messages.

Run `scripts/test_phase1.sh` only after readiness. MAVSDK waits with bounded timeouts for connection and preflight health, then arms, takes off, holds, lands, and confirms disarm. Position samples are NED: north=`x`, east=`y`, down=`z`, and upward altitude is `-z`.

Use `scripts/stop.sh` even after a failed test. It reads the run's `pids` file, terminates children before parents, waits ten seconds, then force-stops only remaining recorded process groups.


# Troubleshooting

* **Package or clone HTTP errors:** outbound package/GitHub access is required. Do not mark versions verified or the environment ready until setup completes.
* **DDS timeout:** inspect `simulation.log`; PX4 must establish a real XRCE client session on loopback UDP 8888.
* **No ROS telemetry:** inspect `ros2.log`, verify matching `px4_msgs`, ROS domain settings, and sensor-data QoS. A topic listing alone is not proof.
* **Gazebo does not start headlessly:** inspect `px4.log`; confirm the checked-out release supports the official `gz_x500` target and Harmonic.
* **Flight failure:** preserve `test.log`, `altitude.csv`, and `evidence.json`. Do not lower thresholds. Fix the root cause, stop, create a new run, and retest.
* **Interrupted startup:** the ERR trap invokes scoped shutdown. If needed, run `scripts/stop.sh`; it never uses broad `pkill` for cleanup.

Known limitation: version discovery depends on available upstream network access. Phase 2 is not ready until Phase 1 has genuine runtime PASS evidence and should retain simulation as the default backend.

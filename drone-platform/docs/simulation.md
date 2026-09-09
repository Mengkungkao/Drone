# Simulation and measured testing

The initial simulation boundary is independent of the flight-controller adapters. Gazebo Harmonic owns the X500 world, physics and sensor simulation; PX4 SITL owns estimation and flight control. React visualizations must not be used as synthetic telemetry evidence.

The existing PX4 scripts are preserved for Phase 2 and retargeted to Ubuntu 24.04 / ROS 2 Jazzy. Execution is disabled by default. Both `start_sitl.sh` and `test_px4_sitl.sh` check DroneLab's verified Phase 1 state and `config/safety.yaml`. The legacy `test_phase1.sh` wrapper has the same gates. Direct Python mission invocation also checks the gates before importing MAVSDK or opening a connection.

The upstream X500 command is `make px4_sitl gz_x500`; it starts PX4 with Gazebo, and `HEADLESS=1` requests headless operation. Confirm support in the selected stable PX4 release before use. See the [official Gazebo simulation guide](https://docs.px4.io/main/en/sim_gazebo_gz/).

When Phase 2 is ready, the retained workflow will use:

```bash
bash scripts/start_sitl.sh
bash scripts/test_px4_sitl.sh
bash scripts/stop.sh
```

Startup allocates a unique UTC-named run directory. PX4's launched process currently also carries Gazebo output in `px4.log`; an empty reserved `gazebo.log` is not evidence. DDS output uses `dds.log`, the ROS monitor uses `ros2.log`, and flight output uses `test.log` with `altitude.csv` and `evidence.json`. Separate MAVSDK/Gazebo capture, robust peer identity, and measured startup deadlines remain Phase 2 work. Existing startup signatures are insufficient to complete the product gate.

The flight sequence retains health verification, simulated arm, takeoff, hover, landing, and disarm. The CSV evaluator checks finite NED samples, increasing elapsed times, altitude `-z`, altitude and drift limits, and measured takeoff/landing/disarm timing. These checks cannot alone prove a live simulator connection or startup/DDS acceptance.

| Required evidence | Acceptance |
| --- | --- |
| PX4 startup | At most 60 s |
| DDS | Genuine PX4 client session |
| ROS local position | At least 5 genuine messages within 30 s |
| Takeoff | 5.0 +/- 0.5 m within 30 s |
| Hover | At least 10 s, within +/- 0.5 m, horizontal drift less than 1.0 m |
| Landing | At or below 0.3 m within 60 s |
| Disarm | Within 30 s of touchdown |
| Entire mission | At most 240 s |

The full mission timer must include connection/preflight, with event timestamps sufficient to reproduce every duration. Stream freshness, process ownership and failure cleanup need end-to-end verification. Until all evidence exists, `.state/project.json` must keep the relevant milestones false.

Unit fixtures exercise acceptance boundaries and cancellation behavior. They do not create production telemetry or integration PASS. No flight was run during the foundation migration.

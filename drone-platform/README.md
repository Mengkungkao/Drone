# Drone Development Platform — Phase 1

This repository provides a **simulation-only** PX4 X500 development platform. Phase 1 orchestrates PX4 SITL and Gazebo Harmonic, transports real PX4 telemetry through Micro XRCE-DDS into ROS 2 Jazzy, and uses MAVSDK to execute an evidence-gated 5 m takeoff, 10 s hover, landing, and disarm mission.

> **Safety:** real hardware, serial devices, firmware flashing, HITL/HIL, motors, and remote control are disabled. The flight client accepts only the local listen-only `udp://:14540` simulation endpoint.

## Architecture

`Gazebo Harmonic X500 ↔ PX4 SITL → uXRCE-DDS client → Micro XRCE-DDS Agent → ROS 2 → drone_monitor`

MAVSDK independently connects to PX4's simulated UDP endpoint for high-level actions. It does not replace or fake the ROS telemetry path. See [the architecture document](docs/architecture.md).

## Requirements

Ubuntu 24.04 x86-64, at least 8 GiB RAM and 20 GiB free space, outbound access to the Ubuntu, ROS, GitHub, and Python package repositories, and root access for the initial package installation. A display is optional; startup defaults to headless operation.

## Install and build

```bash
cd drone-platform
sudo ./scripts/setup.sh
./scripts/build.sh
./scripts/check_environment.sh
```

`setup.sh` discovers the newest upstream PX4 release tag at execution time, checks it out below ignored `third_party/`, obtains the matching `px4_msgs` tag when available, and records exact resolved revisions in `config/versions.yaml`. It is idempotent and does not edit shell startup files.

## Operate and test

```bash
./scripts/start_sitl.sh       # launch and prove real DDS telemetry
source /opt/ros/jazzy/setup.bash
source ros2_ws/install/setup.bash
ros2 run drone_monitor monitor
./scripts/test_phase1.sh      # autonomous measured mission
./scripts/stop.sh             # stop only recorded process groups
```

Each startup creates `logs/YYYY-MM-DD_HHMMSS/`. The flight test continuously writes NED position and `altitude_m=-z` to `altitude.csv`, plus machine-readable metrics and checks to `evidence.json`. Existing runs are never overwritten.

## PASS / FAIL

PASS requires real connection and preflight health, target altitude 5.0 ±0.5 m within 30 s, at least 10 s of hover wholly inside that band, less than 1 m horizontal drift, landing at or below 0.3 m, disarm, and a mission under 240 s. Any missing sample or failed criterion returns non-zero; action success alone cannot produce PASS. `.state/phase1.json` changes to complete only after those measured checks pass.

## Limitations and roadmap

Phase 1 has no real-hardware path, perception, planning, UI, waypoint mission, or HITL/HIL support. A future Phase 2 can add a separately reviewed hardware controller behind the existing C++ interface, but must not weaken the default simulation interlocks. See [troubleshooting](docs/troubleshooting.md) for current operational constraints.


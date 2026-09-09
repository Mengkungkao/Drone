# DroneLab

DroneLab is an engineering desktop application around existing flight-control firmware. Its architecture separates Betaflight over MSP, PX4 over MAVLink, and an independent simulation engine backed by Gazebo and the X500 model. Shared project, telemetry, diagnostics, test, Blackbox, and report contracts sit above those integrations.

The current work is **Phase 0: architecture and foundation**. The desktop source includes a React/TypeScript shell, Tauri/Rust backend, versioned SQLite storage, project model, explicit adapter capabilities, and safety states. On the current Ubuntu 22.04 development host the native release build compiles and `npm run check:launch` has verified two real launches of that binary: storage is provisioned then reopened, migrations apply once, safety latches to DISCONNECTED, and each run is audited and logged. A human has not yet confirmed project creation through the running window, so Phase 0 is not yet marked complete. Hardware communication, configuration writes, flashing, motors, and real flight remain unavailable.

```text
                       DroneLab Desktop
                              |
               Application / domain services
                 /            |             \
         BetaflightAdapter  PX4Adapter  SimulationEngine
                 |            |             |
                MSP        MAVLink        Gazebo
                 |            |             |
             Verified FC  PX4 FC / SITL     X500
                 \            |             /
                 Telemetry / diagnostics / testing
                       Blackbox / reports
```

From this directory:

```bash
npm install
npm run check:environment
npm run check:foundation
npm run dev
```

With the native prerequisites installed, use `npm run desktop:dev` to launch Tauri, `npm run desktop:build` to build it, and `npm run test:native` for Rust tests. See [installation](docs/installation.md) and [development](docs/development.md). Browser preview has no native hardware or SQLite access.

The previous PX4-only project is retained as a **future Phase 2 subsystem** in `scripts/`, `ros2_ws/`, and `simulation/`. It now targets Ubuntu 24.04, ROS 2 Jazzy, and Gazebo Harmonic. `scripts/test_px4_sitl.sh` is the explicit mission entry point; the old `test_phase1.sh` forwards to the same gates. It is not the Betaflight Phase 1 test. No simulator, DDS, telemetry, or flight PASS is claimed.

`.state/project.json` tracks DroneLab milestones. `.state/phase1.json` is retained historical state from the earlier PX4 project and cannot establish a DroneLab milestone. Unit fixtures are isolated from production evidence.

Documentation: [architecture](docs/architecture.md), [safety](docs/safety.md), [Betaflight](docs/betaflight.md), [PX4](docs/px4.md), [simulation](docs/simulation.md), [roadmap](docs/roadmap.md), [troubleshooting](docs/troubleshooting.md).

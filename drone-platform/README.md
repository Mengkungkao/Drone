# DroneLab

DroneLab is an engineering desktop application around existing flight-control firmware. Its architecture separates Betaflight over MSP, PX4 over MAVLink, and an independent simulation engine backed by Gazebo and the X500 model. Shared project, telemetry, diagnostics, test, Blackbox, and report contracts sit above those integrations.

**Phase 0: architecture and foundation** is complete and verified. The desktop source includes a React/TypeScript shell, Tauri/Rust backend, versioned SQLite storage, project model, explicit adapter capabilities, and safety states. The gate is not the browser build: `npm run check:foundation` launches the shipped binary under two checks — `check:launch` reads SQLite directly to confirm storage is provisioned, migrated once and reopened across a restart, and `check:operator` creates a project and a snapshot through the running window, latches the emergency stop, restarts the application and confirms all of it reloaded. Hardware communication, configuration writes, flashing, motors, and real flight remain unavailable.

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
npm install --include=dev
npm run check:environment
npm run desktop:build
npm run check:foundation
```

`npm run desktop:dev` launches Tauri for day-to-day work, `npm run test:native` runs the Rust suite, and `npm run check:launch` / `npm run check:operator` run each launch gate on its own. CI runs the whole gate on every pull request and keeps the evidence as a build artifact. `npm run dev` gives a browser preview with no native hardware or SQLite access; it never counts as launch evidence. See [installation](docs/installation.md) and [development](docs/development.md).

The previous PX4-only project is retained as a **future Phase 2 subsystem** in `scripts/`, `ros2_ws/`, and `simulation/`. It now targets Ubuntu 24.04, ROS 2 Jazzy, and Gazebo Harmonic. `scripts/test_px4_sitl.sh` is the explicit mission entry point; the old `test_phase1.sh` forwards to the same gates. It is not the Betaflight Phase 1 test. No simulator, DDS, telemetry, or flight PASS is claimed.

`.state/project.json` tracks DroneLab milestones. `.state/phase1.json` is retained historical state from the earlier PX4 project and cannot establish a DroneLab milestone. Unit fixtures are isolated from production evidence.

Documentation: [architecture](docs/architecture.md), [safety](docs/safety.md), [Betaflight](docs/betaflight.md), [PX4](docs/px4.md), [simulation](docs/simulation.md), [roadmap](docs/roadmap.md), [troubleshooting](docs/troubleshooting.md).

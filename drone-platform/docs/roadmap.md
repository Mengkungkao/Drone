# Development phases and evidence gates

Only the current phase should be implemented to completion before advancing. Source code, unit tests and UI placeholders cannot substitute for the phase's required runtime evidence.

| Phase | Scope | Gate |
| --- | --- | --- |
| 0 | Desktop, Rust, SQLite, projects, safety, configuration architecture, logging/errors | Native launch, persisted/reopened project, native safety validation, successful builds/tests and recorded evidence |
| 1 | Betaflight read-only slice | Verified FC/board/firmware, configuration read, live gyro displayed, project saved, no unsafe command |
| 2 | PX4 SITL / Gazebo X500 / Jazzy / DDS / MAVSDK | Verified simulated target plus measured startup, telemetry, 5 m takeoff, 10 s hover, land and disarm |
| 3 | Betaflight configuration | Current/new/diff, snapshots, recovery and explicitly confirmed writes |
| 4 | Firmware manager | Identified board, compatible image, backup, explicit confirmation and post-flash verification |
| 5 | 3D simulation | Verified world/aircraft/physics, environmental and failure controls |
| 6 | Automated simulation tests | Deterministic scenarios with measured PASS/WARNING/FAIL |
| 7 | Blackbox | Validated imports, decoding, synchronized signals and evidence-based analysis |
| 8 | HITL | Dedicated safety mode and propulsion disabled by default |
| 9 | Bench tests | Measured sensors/receiver/motors/ESC/failsafe with explicit hazardous-action gates |
| 10 | Flight-test management | Cards, checklists, logs, configuration and operator records; no autonomous real arming |
| 11 | Digital twin comparison | Traceable measured simulation/bench/flight comparisons |
| 12 | Advanced engineering | Validated analysis, recommendations and reproducible regression reports |

Phase 0 is met on the inspected Ubuntu 24.04 host. `npm run check:foundation` records the whole gate in one run: typecheck, unit tests, the production frontend build, the native suite with and without the window layer, and a launch check that starts the release binary and drives its window. That launch created a project and a configuration snapshot through the UI, latched the emergency stop, exited, started again against the same data directory, and found all four reloaded — with the stop clearing only on an explicit operator action. Screenshots, the SQLite database, per-run session logs and a per-check pass record are kept under `logs/launch-<timestamp>/`.

Two limits are worth stating plainly. The launch ran on a virtual display, so GPU rendering, Windows and macOS remain unverified. And nothing here touches hardware: Phase 1 needs a real Betaflight controller, and Phase 2 needs a provisioned simulator. The rest of this table describes future scope, not implemented product functionality.

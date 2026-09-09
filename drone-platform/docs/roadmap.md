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

Current focus is Phase 0. On the inspected Ubuntu 22.04 host the Rust toolchain, GTK/WebKit libraries, TypeScript checks, unit tests, production frontend build, native storage/safety suite, release desktop build and native launch (via `npm run check:launch`, two runs against the release binary: storage provisioned then reopened, migrations applied once, safety latched to DISCONNECTED, each run audited and logged) all pass. Operator-driven project creation through the running window has not been confirmed by a human, so Phase 0 is not yet marked complete. Phase 1 requires actual verified hardware. The rest of this table describes future scope, not implemented product functionality.

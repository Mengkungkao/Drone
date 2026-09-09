# Development

Work one phase at a time. Phase 0 must launch as a native application, persist and reopen a project through SQLite, enforce native safety defaults, produce logs, pass required checks, and retain evidence before it is complete.

From `drone-platform`:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run check:environment
npm run check:foundation
npm run test:native
npm run desktop:build
npm run desktop:dev
```

`npm run test:native` builds the desktop feature and therefore needs the platform's GUI toolchain. Where that is unavailable, `cargo test --workspace --no-default-features` runs the same storage, migration and safety suite without the window layer; `npm run check:foundation` records both and marks the shell `BLOCKED` rather than passing. A blocked shell is never Phase 0 evidence.

Use `npm run dev` for browser preview. It exercises the React shell and clearly unavailable native operations. It is not a substitute for the Tauri launch requirement.

Frontend application code depends on typed domain contracts. Native commands revalidate external inputs and own safety-sensitive operations. Register concrete capabilities rather than assuming every firmware implements position control, motor commands, or configuration writes. An unavailable implementation returns an error and never manufactures identity or telemetry.

For preserved PX4 source checks:

```bash
bash tests/test_platform.sh
python3 -m pytest -q tests
```

These tests neither install system dependencies nor start hardware or simulation. Temporary telemetry fixtures are isolated test data. They must never update integration milestones or be copied into a production run as flight evidence.

Checkpoint facts in `.state/project.json` only after verification. Keep generated dependencies, databases, third-party firmware sources, logs, build output and secrets out of Git. Historical PX4 state remains in `.state/phase1.json`; future subsystem build facts use `.state/px4-sitl.json`.

The phase report must distinguish implemented source, compiled artifacts, unit checks, native runtime checks, and physical or simulator measurements. See [roadmap](roadmap.md) for the next gates.

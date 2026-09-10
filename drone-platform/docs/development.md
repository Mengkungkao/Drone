# Development

Work one phase at a time. Phase 0 must launch as a native application, persist and reopen a project through SQLite, enforce native safety defaults, produce logs, pass required checks, and retain evidence before it is complete.

From `drone-platform`:

```bash
npm install --include=dev
npm run typecheck
npm test
npm run build
npm run check:environment
npm run test:native
npm run desktop:build
npm run check:launch
npm run check:operator
npm run check:foundation
npm run desktop:dev
```

Pass `--include=dev` when the shell exports `NODE_ENV=production`; npm otherwise omits the Tauri CLI, Vite and TypeScript, and `desktop:build` fails with `tauri: not found`.

`npm run test:native` builds the desktop feature and therefore needs the platform's GUI toolchain. Where that is unavailable, `cargo test --workspace --no-default-features` runs the same storage, migration and safety suite without the window layer; `npm run check:foundation` records both and marks the shell `BLOCKED` rather than passing. A blocked shell is never Phase 0 evidence.

Build the desktop binary before `npm run check:foundation`. Its last two steps launch it, so it needs an artifact to start.

## Launch verification

Linking the shell proves it compiles; Phase 0 asks for an application that runs. Two gates answer different questions about the same binary, and both must pass.

### `npm run check:launch` — what a startup leaves behind

Starts the built binary twice against a throwaway data directory, then asserts what a completed startup must have written: the schema at its current version, migrations applied once rather than repeated on restart, safety latched to `DISCONNECTED`, one audited `application_start` per run, and a retained session log per run. It reads SQLite directly, so a storage fault cannot hide behind a rendered screen.

It reports `BLOCKED` when no binary has been built and records a failure rather than crashing when startup produces nothing. It needs no display server or WebDriver, which makes it the gate that still runs where the tooling below is unavailable. It does not drive the user interface.

### `npm run check:operator` — what an operator can do in the window

Drives the running window over WebDriver and records what it observed:

1. the shell renders and reports the native runtime rather than the browser preview;
2. a new data directory opens `DISCONNECTED` with no projects;
3. a project created through the dialog becomes the active airframe;
4. a configuration snapshot saves from the configuration workspace;
5. the emergency stop latches from the operator control.

The application then exits and is started again against the same data directory. Nothing is seeded between runs, so the project, its selection, its snapshot history and the latched stop that appear in the second window were reloaded from SQLite by the application itself. The run finishes by clearing the stop, which only an explicit operator action may do.

Evidence lands in `logs/operator-<timestamp>/`: `operator-flow.json` with a pass/fail record per check, PNG screenshots of both windows, the driver logs, and the isolated data directory holding the SQLite database and the per-run JSONL session logs. The platform's app-data root is redirected there, so a verification run never touches a real workspace.

It needs `tauri-driver` (`cargo install tauri-driver --locked`) and `WebKitWebDriver`. On a headless host it starts `Xvfb` itself and uses `DISPLAY` when one already exists. A virtual display is still a display: the binary, GTK, WebKit, the IPC bridge and SQLite are the shipped ones.

One limit to keep in view when reading the evidence: this drives the interface with an automated WebDriver client, not a person. It shows the operator path works; it is not a usability trial.

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

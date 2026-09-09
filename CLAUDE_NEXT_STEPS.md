# Claude AI handoff: next actions for DroneLab

This file is for the next Claude run. Do not assume the project is working yet. The current verified status shows the environment is not ready for native DroneLab validation.

## Current status

From the environment snapshot in `drone-platform/logs/environment-2026-09-09T01-05-50-720Z/environment.json`:

- OS: Windows 11
- Node: v24.16.0
- Native toolchain present: `false`
- Simulation runtime verified: `false`
- Missing or unavailable tools:
  - `cargo`
  - `rustc`
  - `cmake`
  - `gcc`
  - `docker`
  - `gz`
  - `ros2`
  - `wsl`
  - `msvc`

This means the project is not yet able to complete the required native Phase 0 validation.

## Goal for the next Claude run

Complete the Phase 0 foundation work for the DroneLab desktop stack, but only after the required native toolchain is installed and validated.

## Important constraints

- Do not claim the app works from a browser-only preview.
- Do not treat `npm run dev` as proof of native functionality.
- Do not claim flight, hardware, or simulator success unless verified with real runtime evidence.
- Keep all generated evidence and logs in the project’s evidence/logging structure.
- Only update milestone state after verification, not before.

## Required next steps

### 1) Fix the environment first

Install or enable the missing native prerequisites for desktop + native Rust/Tauri work:

- Rust toolchain (`cargo`, `rustc`)
- CMake
- MSVC / Visual Studio build tools on Windows
- GCC-compatible toolchain if required by the platform
- WSL or Ubuntu 24.04 if working with PX4/Gazebo subsystem tasks later
- Docker only if needed for container-based validation workflows

The current machine is missing the required native build stack, so this is the first dependency gate.

### 2) Install project dependencies

From `drone-platform`:

```bash
npm install
```

Then run the required validation sequence:

```bash
npm run check:environment
npm run check:foundation
npm run typecheck
npm test
npm run build
npm run desktop:build
npm run desktop:dev
```

### 3) Verify the actual Phase 0 gates

Phase 0 requires the native app to:

- launch successfully as a desktop application
- persist and reopen a project through SQLite
- enforce native safety defaults
- produce logs and evidence
- pass required build/test checks

If any of these fail, fix the root cause before moving on.

### 4) Handle the PX4/Gazebo subsystem separately

The project documents a future PX4/SITL/Gazebo path, but it is not the current Phase 0 target.

Do not treat the PX4 subsystem as "done" or "working" unless the environment is explicitly configured for:

- Ubuntu 24.04
- ROS 2 Jazzy
- Gazebo Harmonic

The retained PX4 files in `scripts/`, `ros2_ws/`, and `simulation/` are future-facing and not evidence of a completed DroneLab milestone.

### 5) Enforce evidence discipline

Before recording any milestone or status update:

- verify the runtime condition
- capture the output/log/evidence
- store the result in the project evidence/log structure
- keep the report separated into:
  - implemented source
  - built artifacts
  - unit checks
  - native runtime checks
  - simulator or physical measurements

## What not to do

- Do not claim success from a browser-only preview.
- Do not skip the native toolchain setup.
- Do not update `.state/project.json` without verified evidence.
- Do not treat historical `.state/phase1.json` as current DroneLab status.
- Do not move to Betaflight, PX4 flight, or simulation phases before Phase 0 is verified.

## Recommended execution order for Claude

1. Install the missing native prerequisites.
2. Re-run environment and foundation checks.
3. Fix any native build or runtime issues.
4. Validate SQLite persistence and safety behavior.
5. Verify desktop app launch.
6. Record evidence and only then update milestone state.
7. Only after that, consider any Phase 1 or subsystem work.

## Key project references

- `drone-platform/README.md`
- `drone-platform/docs/development.md`
- `drone-platform/docs/roadmap.md`
- `drone-platform/docs/installation.md`
- `drone-platform/docs/architecture.md`

## Final instruction

The next Claude run should begin by fixing the missing native toolchain and then continue with the Phase 0 verification path. The environment is currently blocked, so the first task is infrastructure setup, not feature implementation.

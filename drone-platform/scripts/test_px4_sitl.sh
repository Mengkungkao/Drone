#!/usr/bin/env bash
# Retained PX4 mission. Global DroneLab phase completion is never inferred here.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
assert_simulation_only
assert_px4_phase_gate
[[ -f "$STATE/current_run" ]] || die 'start SITL first with scripts/start_sitl.sh'
run=$(cat "$STATE/current_run"); [[ -d "$run" ]] || die 'run directory is missing'
"$ROOT/.venv/bin/python" "$ROOT/scripts/phase1_flight.py" --run "$run" --config "$ROOT/config/simulation.yaml" --safety "$ROOT/config/safety.yaml" 2>&1 | tee -a "$run/test.log"
printf 'PX4 flight evaluator finished: %s\n' "$run/evidence.json"
printf '%s\n' 'This does not complete DroneLab Phase 2; startup, DDS, ROS, peer identity, and timing evidence must also be verified.'

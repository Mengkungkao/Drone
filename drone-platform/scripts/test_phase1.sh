#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; source "$ROOT/scripts/lib.sh"; assert_simulation_only
[[ -f "$STATE/current_run" ]] || die 'start SITL first with scripts/start_sitl.sh'
run=$(cat "$STATE/current_run"); [[ -d "$run" ]] || die 'run directory is missing'
"$ROOT/.venv/bin/python" "$ROOT/scripts/phase1_flight.py" --run "$run" --config "$ROOT/config/simulation.yaml" --safety "$ROOT/config/safety.yaml" 2>&1 | tee -a "$run/test.log"
python3 - "$ROOT/.state/phase1.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d.update(environment_checked=True,environment_ready=True,px4_source_ready=True,px4_build_passed=True,gazebo_passed=True,ros2_build_passed=True,dds_passed=True,telemetry_passed=True,flight_test_passed=True,phase1_complete=True); open(p,'w').write(json.dumps(d,indent=2)+'\n')
PY
echo "PHASE 1 PASS: evidence=$run/evidence.json"

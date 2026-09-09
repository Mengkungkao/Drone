#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
assert_simulation_only
assert_supported_platform
[[ -z "${VIRTUAL_ENV:-}" ]] || die 'Deactivate your virtual environment before building ROS'
export PYTHONNOUSERSITE=1
source_ros_jazzy
cd "$ROOT/ros2_ws"
if ! rosdep check --from-paths src --ignore-src --rosdistro jazzy; then
  printf '%s\n' 'BLOCKED: missing ROS system dependencies. Review the missing packages above; no sudo was invoked.'
  printf '%s\n' 'rosdep install --from-paths src --ignore-src --rosdistro jazzy -r --simulate'
  exit 2
fi
colcon build --symlink-install --event-handlers console_direct+
PX4_DIR="${PX4_DIR:-$ROOT/third_party/PX4-Autopilot}"
[[ -d "$PX4_DIR" ]] || { echo 'PX4 source missing; run setup.sh' >&2; exit 1; }
with_px4_python make -C "$PX4_DIR" px4_sitl_default
python3 - "$ROOT/.state/px4-sitl.json" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); d=json.loads(p.read_text()) if p.exists() else {'subsystem':'px4-sitl','dronelab_phase':2,'flight_test_passed':False}; d.update(px4_source_ready=True,px4_build_passed=True,ros2_build_passed=True); p.write_text(json.dumps(d,indent=2)+'\n')
PY

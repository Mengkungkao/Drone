#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
assert_simulation_only
assert_supported_platform
[[ -z "${VIRTUAL_ENV:-}" ]] || die 'Deactivate your virtual environment before building ROS'
export PYTHONNOUSERSITE=1
source_ros_humble
cd "$ROOT/ros2_ws"
rosdep install --from-paths src --ignore-src --rosdistro humble -r -y
colcon build --symlink-install --event-handlers console_direct+
PX4_DIR="${PX4_DIR:-$ROOT/third_party/PX4-Autopilot}"
[[ -d "$PX4_DIR" ]] || { echo 'PX4 source missing; run setup.sh' >&2; exit 1; }
with_px4_python make -C "$PX4_DIR" px4_sitl_default
python3 - "$ROOT/.state/phase1.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p)); d.update(px4_source_ready=True,px4_build_passed=True,ros2_build_passed=True); open(p,'w').write(json.dumps(d,indent=2)+'\n')
PY

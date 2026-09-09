#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
mkdir -p "$ROOT/logs"
exec > >(tee "${ENVIRONMENT_LOG:-$ROOT/logs/environment-latest.log}") 2>&1
fail=0
check_cmd() { if command -v "$1" >/dev/null; then printf 'PASS command: %s (%s)\n' "$1" "$(command -v "$1")"; else printf 'FAIL command: %s\n' "$1"; fail=1; fi; }
assert_simulation_only
assert_supported_platform
export PYTHONNOUSERSITE=1
source_ros_jazzy
. /etc/os-release
printf 'OS=%s VERSION=%s ARCH=%s CPU=%s\n' "$ID" "$VERSION_ID" "$(uname -m)" "$(nproc)"
ram_kib=$(awk '/MemTotal/{print $2}' /proc/meminfo); disk_kib=$(df -Pk "$ROOT" | awk 'NR==2{print $4}')
((ram_kib >= 8*1024*1024)) || { echo 'FAIL: at least 8 GiB RAM required'; fail=1; }
((disk_kib >= 20*1024*1024)) || { echo 'FAIL: at least 20 GiB free required'; fail=1; }
printf 'RAM_KIB=%s FREE_DISK_KIB=%s\n' "$ram_kib" "$disk_kib"
for cmd in python3 gcc g++ cmake git colcon ros2 gz MicroXRCEAgent; do check_cmd "$cmd"; done
python3 -c 'import sys, rclpy; assert sys.version_info[:2] == (3, 12); print("PASS Jazzy Python:", sys.version.split()[0])' || { echo 'FAIL: Jazzy requires the Ubuntu Python 3.12 environment'; fail=1; }
"$ROOT/.venv/bin/python" -c 'import mavsdk; from importlib.metadata import version; print("PASS Python MAVSDK:", version("mavsdk"))' || { echo 'FAIL project Python MAVSDK; run scripts/setup.sh'; fail=1; }
[[ -x "$ROOT/.px4-venv/bin/python" ]] || { echo 'FAIL PX4 Python environment'; fail=1; }
gz sim --versions 2>/dev/null | grep -qE '^8\.' || { echo 'FAIL Gazebo Harmonic (gz-sim 8) required'; fail=1; }
[[ -d "${PX4_DIR:-$ROOT/third_party/PX4-Autopilot}" ]] || { echo 'FAIL PX4 source'; fail=1; }
((fail == 0)) || exit 1
echo 'PASS: environment ready'

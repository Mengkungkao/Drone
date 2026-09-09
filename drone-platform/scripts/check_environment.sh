#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/logs"
exec > >(tee "${ENVIRONMENT_LOG:-$ROOT/logs/environment-latest.log}") 2>&1
fail=0
check_cmd() { if command -v "$1" >/dev/null; then printf 'PASS command: %s (%s)\n' "$1" "$(command -v "$1")"; else printf 'FAIL command: %s\n' "$1"; fail=1; fi; }
. /etc/os-release
printf 'OS=%s VERSION=%s ARCH=%s CPU=%s\n' "$ID" "$VERSION_ID" "$(uname -m)" "$(nproc)"
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04* ]] || { echo 'FAIL: Ubuntu 24.04 required'; fail=1; }
ram_kib=$(awk '/MemTotal/{print $2}' /proc/meminfo); disk_kib=$(df -Pk "$ROOT" | awk 'NR==2{print $4}')
((ram_kib >= 8*1024*1024)) || { echo 'FAIL: at least 8 GiB RAM required'; fail=1; }
((disk_kib >= 20*1024*1024)) || { echo 'FAIL: at least 20 GiB free required'; fail=1; }
printf 'RAM_KIB=%s FREE_DISK_KIB=%s\n' "$ram_kib" "$disk_kib"
for cmd in python3 gcc g++ cmake git colcon ros2 gz MicroXRCEAgent; do check_cmd "$cmd"; done
python3 -c 'import mavsdk; print("PASS Python MAVSDK:", mavsdk.__version__)' 2>/dev/null || { echo 'FAIL Python MAVSDK'; fail=1; }
[[ -d "${PX4_DIR:-$ROOT/third_party/PX4-Autopilot}" ]] || { echo 'FAIL PX4 source'; fail=1; }
((fail == 0)) || exit 1
echo 'PASS: environment ready'

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; source "$ROOT/scripts/lib.sh"; assert_simulation_only
[[ ! -e "$STATE/current_run" ]] || die 'a managed run is already active; use scripts/stop.sh'
assert_supported_platform
export PYTHONNOUSERSITE=1
source_ros_humble
source_ros_workspace
run="$ROOT/logs/$(date -u +%Y-%m-%d_%H%M%S)"; mkdir -p "$run"; touch "$run"/{px4,ros2,simulation,test}.log "$run/altitude.csv"
ENVIRONMENT_LOG="$run/environment.log" "$ROOT/scripts/check_environment.sh"
printf '%s\n' "$run" > "$STATE/current_run"; pids="$run/pids"
cleanup() { "$ROOT/scripts/stop.sh" >/dev/null 2>&1 || true; }; trap cleanup ERR INT TERM
start_group() { local name=$1 log=$2; shift 2; setsid "$@" >>"$log" 2>&1 & local pid=$!; printf '%s %s\n' "$name" "$pid" >> "$pids"; }
PX4_DIR="${PX4_DIR:-$ROOT/third_party/PX4-Autopilot}"
[[ -x "$PX4_DIR/build/px4_sitl_default/bin/px4" ]] || die 'PX4 SITL is not built'
export HEADLESS="${HEADLESS:-1}"
[[ -x "$ROOT/.px4-venv/bin/python" ]] || die 'PX4 Python environment is missing; run scripts/setup.sh'
start_group px4 "$run/px4.log" bash -c 'source "$1/.px4-venv/bin/activate"; cd "$2" && exec make px4_sitl gz_x500' _ "$ROOT" "$PX4_DIR"
for _ in {1..60}; do grep -qE 'Ready for takeoff|INFO.*px4' "$run/px4.log" && break; kill -0 "$(awk '$1=="px4"{print $2}' "$pids")" || die 'PX4 exited'; sleep 1; done
grep -qE 'Ready for takeoff|INFO.*px4' "$run/px4.log" || die 'PX4 readiness timeout'
for _ in {1..60}; do pgrep -P "$(awk '$1=="px4"{print $2}' "$pids")" -f 'gz|ruby' >/dev/null && break; sleep 1; done
pgrep -f 'gz sim' >/dev/null || die 'Gazebo readiness timeout'
start_group dds "$run/simulation.log" MicroXRCEAgent udp4 -p 8888
for _ in {1..30}; do grep -qiE 'client.*(create|connected)|session established' "$run/simulation.log" && break; sleep 1; done
grep -qiE 'client.*(create|connected)|session established' "$run/simulation.log" || die 'DDS client connection timeout'
start_group monitor "$run/ros2.log" ros2 run drone_monitor monitor
for _ in {1..30}; do grep -q TELEMETRY_VERIFIED "$run/ros2.log" && break; sleep 1; done
grep -q TELEMETRY_VERIFIED "$run/ros2.log" || die 'real ROS telemetry verification failed'
trap - ERR INT TERM
echo "READY run=$run"

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE="$ROOT/.state"
export PATH="$ROOT/.local/bin:$PATH"
export LD_LIBRARY_PATH="$ROOT/.local/lib:${LD_LIBRARY_PATH:-}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
check_target_os() {
  [[ "$1" == ubuntu && "$2" == 24.04 && "$3" == x86_64 ]] || {
    echo 'ERROR: Ubuntu 24.04 LTS (Noble), x86-64, is required for ROS 2 Jazzy' >&2
    return 1
  }
}
assert_supported_platform() {
  [[ -r /etc/os-release ]] || die 'Ubuntu 24.04 LTS is required'
  local ID VERSION_ID
  source /etc/os-release
  check_target_os "$ID" "$VERSION_ID" "$(uname -m)" || exit 1
  [[ -z "${ROS_DISTRO:-}" || "$ROS_DISTRO" == jazzy ]] || die "ROS_DISTRO=$ROS_DISTRO; open a fresh Jazzy shell"
}
source_ros_jazzy() {
  [[ -z "${ROS_DISTRO:-}" || "$ROS_DISTRO" == jazzy ]] || die "ROS_DISTRO=$ROS_DISTRO; open a fresh Jazzy shell"
  [[ -r /opt/ros/jazzy/setup.bash ]] || die 'ROS 2 Jazzy is missing; run scripts/setup.sh for manual provisioning commands'
  # Generated ROS setup scripts read unset variables. Restore strict mode afterward.
  set +u
  source /opt/ros/jazzy/setup.bash
  set -u
  [[ "$ROS_DISTRO" == jazzy ]] || die 'failed to load ROS 2 Jazzy'
}
source_ros_workspace() {
  [[ -r "$ROOT/ros2_ws/install/local_setup.bash" ]] || die 'ROS workspace is missing; run scripts/build.sh'
  set +u
  # The underlay is already loaded; do not re-source a cached distro chain.
  source "$ROOT/ros2_ws/install/local_setup.bash"
  set -u
}
with_px4_python() (
  [[ -x "$ROOT/.px4-venv/bin/python" ]] || die 'PX4 Python environment is missing; run scripts/setup.sh'
  source "$ROOT/.px4-venv/bin/activate"
  "$@"
)
yaml_value() {
  local key=${2##*.}
  awk -F: -v key="$key" '$1 ~ "^[[:space:]]*" key "[[:space:]]*$" {v=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", v); print tolower(v); exit}' "$ROOT/$1"
}
assert_simulation_only() {
  [[ "$(yaml_value config/safety.yaml simulation_only)" == true ]] || die "simulation-only interlock is disabled"
  [[ "$(yaml_value config/safety.yaml real_hardware_enabled)" == false ]] || die "real hardware must remain disabled"
  [[ "$(yaml_value config/safety.yaml allow_serial_devices)" == false ]] || die "serial access must remain disabled"
}
assert_px4_phase_gate() {
  python3 "$ROOT/scripts/phase_gate.py" "$STATE/project.json"
  [[ "$(yaml_value config/safety.yaml px4_runtime_enabled)" == true ]] || die 'PX4 runtime remains disabled pending Phase 2 network/vehicle identity verification; see docs/px4.md'
}

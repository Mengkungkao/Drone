#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
assert_simulation_only
[[ $(id -u) -eq 0 ]] || { echo 'Root is required. Run exactly: sudo ./scripts/setup.sh'; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04* ]] || die 'Ubuntu 24.04 is required'
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg lsb-release build-essential cmake ninja-build python3-pip python3-yaml python3-venv wget
install -d -m 0755 /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/ros-archive-keyring.gpg ]]; then curl -fsSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key | gpg --dearmor -o /etc/apt/keyrings/ros-archive-keyring.gpg; fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(. /etc/os-release && echo "$UBUNTU_CODENAME") main" > /etc/apt/sources.list.d/ros2.list
apt-get update
apt-get install -y ros-jazzy-desktop ros-dev-tools ros-jazzy-ros-gz python3-colcon-common-extensions python3-rosdep micro-xrce-dds-agent
rosdep init 2>/dev/null || [[ -f /etc/ros/rosdep/sources.list.d/20-default.list ]]
rosdep update
mkdir -p "$ROOT/third_party"
if [[ ! -d "$ROOT/third_party/PX4-Autopilot/.git" ]]; then
  tag=$(git ls-remote --tags --refs https://github.com/PX4/PX4-Autopilot.git 'v*' | awk -F/ '{print $3}' | sort -V | tail -1)
  [[ -n "$tag" ]] || die 'could not determine newest PX4 release'
  git clone --recursive --branch "$tag" --depth 1 https://github.com/PX4/PX4-Autopilot.git "$ROOT/third_party/PX4-Autopilot"
fi
px4_tag=$(git -C "$ROOT/third_party/PX4-Autopilot" describe --tags --exact-match)
px4_commit=$(git -C "$ROOT/third_party/PX4-Autopilot" rev-parse HEAD)
if [[ ! -d "$ROOT/ros2_ws/src/px4_msgs/.git" ]]; then git clone --depth 1 --branch "$px4_tag" https://github.com/PX4/px4_msgs.git "$ROOT/ros2_ws/src/px4_msgs" || git clone --depth 1 https://github.com/PX4/px4_msgs.git "$ROOT/ros2_ws/src/px4_msgs"; fi
python3 -m venv "$ROOT/.venv" --system-site-packages
"$ROOT/.venv/bin/pip" install --upgrade mavsdk PyYAML
python3 - "$ROOT/config/versions.yaml" "$px4_tag" "$px4_commit" <<'PY'
import sys,yaml,subprocess
p,tag,commit=sys.argv[1:]; d=yaml.safe_load(open(p)); d['px4']={'version':tag,'commit':commit}; d['px4_msgs']['version']=subprocess.check_output(['git','-C',p.replace('/config/versions.yaml','/ros2_ws/src/px4_msgs'),'rev-parse','HEAD'],text=True).strip(); d['mavsdk']['version']=subprocess.check_output([p.replace('/config/versions.yaml','/.venv/bin/python'),'-c','import importlib.metadata;print(importlib.metadata.version("mavsdk"))'],text=True).strip(); d['micro_xrce_dds_agent']['version']='apt:micro-xrce-dds-agent'; yaml.safe_dump(d,open(p,'w'),sort_keys=False)
PY
echo 'Setup complete; versions recorded in config/versions.yaml'


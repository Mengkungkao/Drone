#!/usr/bin/env bash
# Inspect prerequisites and prepare user-owned sources. Never invoke sudo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
assert_simulation_only
assert_supported_platform
[[ $(id -u) -ne 0 ]] || die 'Run setup as your normal user'
[[ -z "${VIRTUAL_ENV:-}" ]] || die 'Deactivate your virtual environment before setup'
export LANG=C.UTF-8 PYTHONNOUSERSITE=1

# Cached sudo credentials do not authorize privileged actions by this script.
packages=(git build-essential cmake ninja-build python3-pip python3-yaml python3-venv
  curl ca-certificates ros-jazzy-desktop ros-dev-tools ros-jazzy-ros-gz gz-harmonic
  python3-colcon-common-extensions python3-rosdep python3-pytest
  bc libunwind-dev libeigen3-dev libgstreamer-plugins-base1.0-dev libopencv-dev
  gstreamer1.0-plugins-bad gstreamer1.0-plugins-base gstreamer1.0-plugins-good
  gstreamer1.0-plugins-ugly gstreamer1.0-libav libimage-exiftool-perl
  libxml2-utils pkg-config protobuf-compiler libasio-dev libtinyxml2-dev)
missing=()
for package in "${packages[@]}"; do
  [[ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true)" == 'install ok installed' ]] || missing+=("$package")
done
if ((${#missing[@]})); then
  printf '%s\n' 'BLOCKED: system dependencies are missing. No elevated command has been run.'
  printf '%s\n' 'Configure the official ROS Jazzy and Gazebo Harmonic apt repositories using docs/installation.md, then review and run:'
  printf '%s\n' 'sudo apt-get update'
  printf 'sudo apt-get install --no-remove'; printf ' %q' "${missing[@]}"; printf '\n'
  exit 2
fi
if [[ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]]; then
  printf '%s\n' 'BLOCKED: rosdep system initialization is required. Review and run:' 'sudo rosdep init'
  exit 2
fi

need git; need curl; need python3; need cmake
mkdir -p "$STATE/downloads" "$ROOT/third_party"
# Resolve a published non-prerelease at execution time. A tag is provenance,
# not proof that the selected release builds or flies.
px4_dir="$ROOT/third_party/PX4-Autopilot"
if [[ ! -d "$px4_dir/.git" ]]; then
  tag=$(curl --fail --silent --show-error --location https://api.github.com/repos/PX4/PX4-Autopilot/releases/latest |
    python3 -c 'import json,sys; d=json.load(sys.stdin); assert not d["draft"] and not d["prerelease"]; print(d["tag_name"])')
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'could not resolve a stable PX4 release'
  git clone --recursive --branch "$tag" --depth 1 https://github.com/PX4/PX4-Autopilot.git "$px4_dir"
fi
px4_tag=$(git -C "$px4_dir" describe --tags --exact-match)
[[ "$px4_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'PX4 checkout must be an exact stable release tag'
[[ -z "$(git -C "$px4_dir" status --porcelain)" ]] || die 'PX4 checkout contains local changes; preserve and review them before preparing dependencies'
msgs_version=${px4_tag#v}; msgs_branch="release/${msgs_version%.*}"
msgs_dir="$ROOT/ros2_ws/src/px4_msgs"
if [[ ! -d "$msgs_dir/.git" ]]; then
  git clone --depth 1 --branch "$msgs_branch" https://github.com/PX4/px4_msgs.git "$msgs_dir"
fi
[[ "$(git -C "$msgs_dir" symbolic-ref --short HEAD)" == "$msgs_branch" ]] || die "px4_msgs must use $msgs_branch for $px4_tag; preserve existing work before reconciling"

# Upstream Tools/setup/ubuntu.sh can elevate; it is never invoked here.
python3 -m venv "$ROOT/.px4-venv"
"$ROOT/.px4-venv/bin/python" -m pip install -r "$px4_dir/Tools/setup/requirements.txt"
python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/python" -m pip install mavsdk PyYAML

# Current PX4 ROS 2 documentation pairs Jazzy with this 2.x agent.
# Re-verify compatibility when changing PX4; never silently substitute 3.x.
agent_tag=v2.4.3
agent_dir="$ROOT/third_party/Micro-XRCE-DDS-Agent"
if [[ ! -d "$agent_dir/.git" ]]; then
  git clone --depth 1 --branch "$agent_tag" https://github.com/eProsima/Micro-XRCE-DDS-Agent.git "$agent_dir"
fi
[[ "$(git -C "$agent_dir" describe --tags --exact-match)" == "$agent_tag" ]] || die "Micro XRCE-DDS Agent must be $agent_tag; reconcile the checkout manually"
cmake -S "$agent_dir" -B "$agent_dir/build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$ROOT/.local"
cmake --build "$agent_dir/build" --parallel "$(nproc)"
cmake --install "$agent_dir/build"
rosdep update --rosdistro jazzy
python3 "$ROOT/scripts/record_versions.py" "$ROOT"
printf '%s\n' 'User-owned dependency preparation finished. Runtime is unverified; run scripts/build.sh for build checks.'

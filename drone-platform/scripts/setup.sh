#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"
assert_simulation_only
assert_supported_platform
[[ $(id -u) -ne 0 ]] || die 'Run ./scripts/setup.sh as your normal user; it uses sudo for system installation'
[[ -z "${VIRTUAL_ENV:-}" ]] || die 'Deactivate your virtual environment before setup'
need sudo
sudo -v
export LANG=C.UTF-8 PYTHONNOUSERSITE=1
sudo apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-remove \
  ca-certificates curl gnupg lsb-release software-properties-common
sudo add-apt-repository -y universe
sudo apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-remove \
  git build-essential cmake ninja-build python3-pip python3-yaml python3-venv wget
mkdir -p "$STATE/downloads" "$ROOT/third_party"

# Reuse an existing ROS repository, including ros2-apt-source-managed installs.
if ! grep -RqsE '^[^#]*(packages\.ros\.org/ros2/ubuntu)' /etc/apt/sources.list /etc/apt/sources.list.d; then
  ros_apt_version=$(curl -fsSL https://api.github.com/repos/ros-infrastructure/ros-apt-source/releases/latest |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')
  [[ "$ros_apt_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'could not resolve ros2-apt-source release'
  curl -fL "https://github.com/ros-infrastructure/ros-apt-source/releases/download/${ros_apt_version}/ros2-apt-source_${ros_apt_version}.jammy_all.deb" -o "$STATE/downloads/ros2-apt-source.deb"
  sudo dpkg -i "$STATE/downloads/ros2-apt-source.deb"
fi
if ! grep -RqsE '^[^#]*(packages\.osrfoundation\.org/gazebo/ubuntu-stable)' /etc/apt/sources.list /etc/apt/sources.list.d; then
  curl -fsSL https://packages.osrfoundation.org/gazebo.gpg -o "$STATE/downloads/gazebo.gpg"
  sudo install -m 0644 "$STATE/downloads/gazebo.gpg" /usr/share/keyrings/pkgs-osrf-archive-keyring.gpg
  printf '%s\n' 'deb [arch=amd64 signed-by=/usr/share/keyrings/pkgs-osrf-archive-keyring.gpg] https://packages.osrfoundation.org/gazebo/ubuntu-stable jammy main' |
    sudo tee /etc/apt/sources.list.d/gazebo-stable.list >/dev/null
fi
sudo apt-get update
# Jammy's systemd/udev updates must precede ROS desktop dependency resolution.
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-remove --only-upgrade systemd udev
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-remove \
  ros-humble-desktop ros-dev-tools ros-humble-ros-gzharmonic gz-harmonic \
  python3-colcon-common-extensions python3-rosdep python3-pytest \
  bc libunwind-dev libeigen3-dev libgstreamer-plugins-base1.0-dev libopencv-dev \
  gstreamer1.0-plugins-bad gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-ugly gstreamer1.0-libav libimage-exiftool-perl \
  libxml2-utils pkg-config protobuf-compiler libasio-dev libtinyxml2-dev
if [[ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]]; then sudo rosdep init; fi
rosdep update --rosdistro humble

px4_dir="$ROOT/third_party/PX4-Autopilot"
if [[ ! -d "$px4_dir/.git" ]]; then
  tag=$(git ls-remote --tags --refs https://github.com/PX4/PX4-Autopilot.git 'v*' |
    awk -F/ '$3 ~ /^v[0-9]+\.[0-9]+\.[0-9]+$/ {print $3}' | sort -V | tail -1)
  [[ -n "$tag" ]] || die 'could not determine newest stable PX4 release'
  git clone --recursive --branch "$tag" --depth 1 https://github.com/PX4/PX4-Autopilot.git "$px4_dir"
fi
px4_tag=$(git -C "$px4_dir" describe --tags --exact-match)
[[ "$px4_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'PX4 checkout must be a stable release tag'
px4_commit=$(git -C "$px4_dir" rev-parse HEAD)
msgs_version=${px4_tag#v}
msgs_branch="release/${msgs_version%.*}"
msgs_dir="$ROOT/ros2_ws/src/px4_msgs"
if [[ ! -d "$msgs_dir/.git" ]]; then
  git clone --depth 1 --branch "$msgs_branch" https://github.com/PX4/px4_msgs.git "$msgs_dir"
fi
[[ "$(git -C "$msgs_dir" symbolic-ref --short HEAD)" == "$msgs_branch" ]] || die "px4_msgs must use $msgs_branch for $px4_tag; move the old checkout aside and rerun setup"

# Keep PX4 pip dependencies separate from Humble's apt-managed Python packages.
python3 -m venv "$ROOT/.px4-venv"
with_px4_python bash "$px4_dir/Tools/setup/ubuntu.sh" --no-nuttx --no-sim-tools

# Humble uses the 2.4.2 agent; do not install an incompatible 3.x agent.
agent_tag=v2.4.2
agent_dir="$ROOT/third_party/Micro-XRCE-DDS-Agent"
if [[ ! -d "$agent_dir/.git" ]]; then
  git clone --depth 1 --branch "$agent_tag" https://github.com/eProsima/Micro-XRCE-DDS-Agent.git "$agent_dir"
fi
[[ "$(git -C "$agent_dir" describe --tags --exact-match)" == "$agent_tag" ]] || die "Micro XRCE-DDS Agent must be $agent_tag; move the old checkout aside and rerun setup"
cmake -S "$agent_dir" -B "$agent_dir/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$agent_dir/build" --parallel "$(nproc)"
sudo cmake --install "$agent_dir/build"
sudo ldconfig

python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/python" -m pip install --upgrade mavsdk PyYAML
python3 - "$ROOT" "$px4_tag" "$px4_commit" "$msgs_branch" "$agent_tag" <<'PY'
import pathlib, subprocess, sys, yaml
root = pathlib.Path(sys.argv[1])
tag, commit, msgs_branch, agent_tag = sys.argv[2:]
path = root / 'config/versions.yaml'
data = yaml.safe_load(path.read_text())
def revision(directory):
    return subprocess.check_output(['git', '-C', str(directory), 'rev-parse', 'HEAD'], text=True).strip()
data['ubuntu'] = {'version': '22.04', 'codename': 'jammy'}
data['ros2']['distribution'] = 'humble'
data['px4'] = {'version': tag, 'commit': commit}
data['px4_msgs'] = {'branch': msgs_branch, 'version': revision(root / 'ros2_ws/src/px4_msgs')}
data['mavsdk']['version'] = subprocess.check_output([
    str(root / '.venv/bin/python'), '-c',
    'from importlib.metadata import version; print(version("mavsdk"))'
], text=True).strip()
data['micro_xrce_dds_agent'] = {
    'requested_version': agent_tag, 'version': agent_tag,
    'commit': revision(root / 'third_party/Micro-XRCE-DDS-Agent')
}
path.write_text(yaml.safe_dump(data, sort_keys=False))
PY
echo 'Setup complete for Ubuntu 22.04 / ROS 2 Humble; run scripts/build.sh'

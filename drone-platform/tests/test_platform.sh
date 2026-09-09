#!/usr/bin/env bash
# Unit checks only; these do not install dependencies or start a simulator.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib.sh"

for script in "$ROOT"/scripts/*.sh; do bash -n "$script"; done
check_target_os ubuntu 22.04 x86_64
if check_target_os ubuntu 24.04 x86_64 2>/dev/null; then
  die 'unsupported Ubuntu release was accepted'
fi
if check_target_os debian 22.04 x86_64 2>/dev/null; then
  die 'unsupported operating system was accepted'
fi
if check_target_os ubuntu 22.04 aarch64 2>/dev/null; then
  die 'unsupported architecture was accepted'
fi
if (export ROS_DISTRO=jazzy; source_ros_humble) 2>/dev/null; then
  die 'mixed ROS environment was accepted'
fi
assert_simulation_only
echo 'PASS: shell syntax, target platform guards, and simulation configuration'

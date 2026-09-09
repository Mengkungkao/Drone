# Installation and versions

The target is **Ubuntu 22.04 LTS (Jammy), x86-64, with ROS 2 Humble**. Humble's Ubuntu binary packages target Jammy; see the [ROS installation guide](https://docs.ros.org/en/humble/Installation/Ubuntu-Install-Debs.html). Start from an updated Ubuntu installation and a regular user account with `sudo` access.

## Install and build

From the repository root, in a Bash terminal:

```bash
cd drone-platform
./scripts/setup.sh
./scripts/build.sh
./scripts/check_environment.sh
```

Run setup without a leading `sudo`. It elevates system tasks while keeping source checkouts, builds, and the project-local MAVSDK virtual environment owned by your user. The scripts target Jammy/Humble and reject another sourced ROS distribution. They do not modify `.bashrc`.

Setup reuses an existing ROS apt source or installs the managed `ros2-apt-source` package when none exists. It adds the OSRF repository and installs Humble, `gz-harmonic`, `ros-humble-ros-gzharmonic`, simulation dependencies, build tools, and rosdep. It runs the selected PX4 release's Ubuntu toolchain setup with `--no-nuttx --no-sim-tools` in `.px4-venv`; the project supplies simulator packages separately. Micro XRCE-DDS Agent is built from the pinned v2.4.2 source tag.

The PX4 Python toolchain uses `.px4-venv`, MAVSDK uses `.venv`, and ROS/colcon use Ubuntu's system Python 3.10. The scripts select these environments for their respective commands.

## Gazebo and source compatibility

Harmonic is retained for PX4's modern Gazebo X500 simulation. The [PX4 ROS 2 guide](https://docs.px4.io/main/en/ros2/user_guide) documents Humble on Ubuntu 22.04 with `ros-humble-ros-gzharmonic`. This is an OSRF-provided pairing: Humble's default Gazebo pairing is Fortress. The Harmonic packages conflict with `ros-humble-ros-gz*` Fortress packages; resolve that package conflict before setup, following the [Gazebo Humble/Harmonic instructions](https://gazebosim.org/docs/harmonic/ros_installation/#gazebo-harmonic-with-ros-2-humble).

Setup selects the highest version-sorted released PX4 `vX.Y.Z` tag, excluding prereleases. It requires the matching `px4_msgs` `release/X.Y` branch, with no fallback to `main`. Existing checkouts are retained and checked; a mismatch fails explicitly instead of replacing local work. Exact resolved source revisions and installed dependency versions are recorded in `config/versions.yaml`. A network or setup failure does not establish environment readiness.

## Rebuild a workspace previously used with Jazzy

Use a fresh Bash terminal that has not sourced Jazzy or the old workspace. If shell startup files automatically source them, remove those entries first. Copy the source repository to the Ubuntu 22.04 machine; binaries built on Ubuntu 24.04/Jazzy cannot serve as the Humble workspace.

Prefer a fresh Git clone on Ubuntu 22.04, which excludes generated files. If transferring an entire working tree, preserve old colcon output, virtual environments, and CMake build output before building. From `drone-platform`, the following moves only those generated directories into a new backup:

```bash
mkdir -p .state
workspace_backup="$(mktemp -d "$PWD/.state/pre-humble.XXXXXX")"
for output_dir in build install log; do
    if [ -e "ros2_ws/$output_dir" ]; then
        mv -- "ros2_ws/$output_dir" "$workspace_backup/"
    fi
done
for env_dir in .venv .px4-venv; do
    if [ -e "$env_dir" ]; then
        mv -- "$env_dir" "$workspace_backup/"
    fi
done
for source_dir in PX4-Autopilot Micro-XRCE-DDS-Agent; do
    if [ -d "third_party/$source_dir/build" ]; then
        mv -- "third_party/$source_dir/build" "$workspace_backup/$source_dir-build"
    fi
done
./scripts/setup.sh
./scripts/build.sh
./scripts/check_environment.sh
```

Keep source checkouts and flight logs. If setup reports a source-version mismatch, preserve any local edits and reconcile that checkout with the reported release before rerunning. Build and dependency checks are necessary, but real DDS telemetry and the measured flight test are still required for Phase 1 PASS.

## Source checks

From `drone-platform`, run these checks before starting SITL:

```bash
bash tests/test_platform.sh
python3 -m pytest -q tests
```

The migration passed shell syntax/platform-guard checks and all five Python tests on the editing host using Git Bash and Python 3.13. The telemetry tests cover delayed armed updates and Python 3.10's distinct `asyncio.TimeoutError` behavior. These tests use local test inputs; they do not establish simulator, ROS, or flight readiness. Repeat them with Ubuntu's Python 3.10, then run the full build and measured mission on the target system.

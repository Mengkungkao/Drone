# Installation and versions

Run `scripts/setup.sh` on Ubuntu 24.04. It installs ROS 2 Jazzy and `ros-jazzy-ros-gz`, Micro XRCE-DDS Agent, build tools, rosdep, and a project-local MAVSDK virtual environment. It adds only a deterministic ROS apt source/key if absent and never modifies `.bashrc`.

The setup queries official PX4 Git tags and selects the highest version-sorted released tag rather than embedding a stale version. Exact PX4 and `px4_msgs` commits and the installed MAVSDK version are written to `config/versions.yaml`. If upstream cannot be reached, setup fails and leaves values unverified.

Build with `scripts/build.sh`; compiler and colcon output remains visible and any failure is returned to the caller.


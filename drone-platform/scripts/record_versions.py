"""Record observed dependencies; never mark a runtime milestone passed."""
import datetime
import pathlib
import subprocess
import sys

import yaml


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def main(root):
    path = root / "config/versions.yaml"
    data = yaml.safe_load(path.read_text())
    px4 = root / "third_party/PX4-Autopilot"
    agent = root / "third_party/Micro-XRCE-DDS-Agent"
    msgs = root / "ros2_ws/src/px4_msgs"
    data["px4"].update(version=output("git", "-C", str(px4), "describe", "--tags", "--exact-match"), commit=output("git", "-C", str(px4), "rev-parse", "HEAD"))
    data["px4_msgs"].update(branch=output("git", "-C", str(msgs), "symbolic-ref", "--short", "HEAD"), version=output("git", "-C", str(msgs), "rev-parse", "HEAD"))
    data["micro_xrce_dds_agent"].update(version=output("git", "-C", str(agent), "describe", "--tags", "--exact-match"), commit=output("git", "-C", str(agent), "rev-parse", "HEAD"))
    data["ros2"]["version"] = output("dpkg-query", "-W", "-f=${Version}", "ros-jazzy-ros-base")
    data["gazebo"]["version"] = output("gz", "sim", "--versions")
    data["mavsdk"]["version"] = output(str(root / ".venv/bin/python"), "-c", 'from importlib.metadata import version; print(version("mavsdk"))')
    data["last_dependency_observation_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    path.write_text(yaml.safe_dump(data, sort_keys=False))


if __name__ == "__main__":
    main(pathlib.Path(sys.argv[1]))

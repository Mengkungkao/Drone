# Architecture

Gazebo Harmonic supplies physics and sensors for the official `gz_x500` model. PX4 SITL owns estimation and flight control. PX4's uXRCE-DDS client connects over loopback UDP port 8888 to Micro XRCE-DDS Agent, which publishes `px4_msgs` into ROS 2 Jazzy. `drone_monitor` subscribes with sensor-data QoS and requires five actual `VehicleLocalPosition` samples.

MAVSDK connects to PX4 SITL at the local UDP listen endpoint and provides high-level health, arm, takeoff, land, and disarm operations. The reusable `DroneController` C++ contract reserves position and velocity operations for later phases; no low-level competing control path exists in Phase 1.

Safety is defense in depth: checked YAML interlocks, no serial discovery, a loopback/listen-only URL check, ignored upstream source/build output, and PID/process-group-scoped shutdown.


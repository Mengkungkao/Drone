# PX4 integration

Status: PX4 adapter and simulation contracts are separated; the prior Python/ROS runner is retained for Phase 2. Neither physical PX4 operation nor the new simulator environment is verified.

The intended controller path is `PX4Adapter -> MAVLink/MAVSDK -> verified PX4 FC or managed PX4 SITL`. Target kind is explicit. `SimulationEngine -> Gazebo Harmonic -> X500` owns the world and physics separately. PX4's uXRCE-DDS client provides a parallel ROS 2 telemetry path through Micro XRCE-DDS Agent.

The requested simulation stack is Ubuntu 24.04, ROS 2 Jazzy, Gazebo Harmonic, a stable released PX4 tag, matching `px4_msgs`, Micro XRCE-DDS Agent, and MAVSDK. Current [PX4 ROS 2 documentation](https://docs.px4.io/main/en/ros2/user_guide) includes Jazzy installation and the 2.4.3 agent source recipe. The [PX4 Gazebo guide](https://docs.px4.io/main/en/sim_gazebo_gz/) documents `make px4_sitl gz_x500`. Verify those instructions against the selected release when provisioning.

`config/versions.yaml` separates requested stack and unverified installed revisions. `setup.sh` resolves the published latest stable PX4 release only when preparing a fresh checkout, rejects prereleases, preserves existing source, and records observed source/package versions after success. It never declares flight readiness from a source tag.

Before enabling runtime, Phase 2 must replace the inherited broad UDP listener assumption with verified simulator ownership, constrained network exposure, and target identity. It must also enforce scoped PX4/Gazebo process readiness, measured startup deadlines, continuous fresh telemetry and failure cleanup. Until that work is verified, `px4_runtime_enabled: false` and the Phase 1 prerequisite prevent execution.

The CSV evaluator checks the retained flight thresholds, but does not establish DDS session authenticity, live ROS sample timing, simulator identity or entire mission timing. `test_px4_sitl.sh` never marks the global Phase 2 complete. Historical `test_phase1.sh` remains a gated compatibility wrapper.

See [simulation](simulation.md) for the exact acceptance contract and [installation](installation.md) for privilege-free preparation behavior.

# Betaflight integration

Status: the adapter boundary, capability description and the MSP protocol layer exist. `src-tauri/src/msp.rs` encodes the read-only requests this phase permits and decodes v1/v2 frames, the identity messages and `MSP_RAW_IMU`, with unit tests covering split reads, corrupt checksums, oversized frames, truncated payloads and an echoed request. No serial port is opened, no device is enumerated, and no controller has been contacted, so the Phase 1 gate is untouched.

The codec exists to be given real bytes later; passing tests against constructed frames says the decoder follows the specification, not that any hardware answered.

The Phase 1 sequence is: explicitly select and verify the FC, identify its board and firmware, read supported basic configuration, receive genuine gyro telemetry, display it, and save the selected DroneProject. All steps need logs and measured hardware evidence before the gate passes.

MSP encoding/decoding and USB serial access belong in native infrastructure behind `BetaflightAdapter`. Shared UI code receives typed identity, capabilities, configuration snapshots, errors and timestamped samples. Never expose unrestricted raw MSP/CLI bytes as a general UI command.

Configuration writes, CLI execution, firmware flashing, arming and motor control remain disabled. Discovery must not silently send requests to every serial device. Unsupported firmware/MSP responses need explicit error handling and request timeouts.

Blackbox retrieval, receiver diagnostics, GPS and RPM availability depend on the verified firmware/board capabilities. Those features are future work and must not be represented by invented values.

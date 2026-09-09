# Betaflight integration

Status: adapter boundary and capability description are part of the foundation. The real read-only hardware slice is not verified. No flight controller has been probed or opened by this migration.

The Phase 1 sequence is: explicitly select and verify the FC, identify its board and firmware, read supported basic configuration, receive genuine gyro telemetry, display it, and save the selected DroneProject. All steps need logs and measured hardware evidence before the gate passes.

MSP encoding/decoding and USB serial access belong in native infrastructure behind `BetaflightAdapter`. Shared UI code receives typed identity, capabilities, configuration snapshots, errors and timestamped samples. Never expose unrestricted raw MSP/CLI bytes as a general UI command.

Configuration writes, CLI execution, firmware flashing, arming and motor control remain disabled. Discovery must not silently send requests to every serial device. Unsupported firmware/MSP responses need explicit error handling and request timeouts.

Blackbox retrieval, receiver diagnostics, GPS and RPM availability depend on the verified firmware/board capabilities. Those features are future work and must not be represented by invented values.

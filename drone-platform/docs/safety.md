# Safety

Safety state is part of the application domain and must be enforced again at the native command boundary. The required state vocabulary is DISCONNECTED, CONNECTED, READ_ONLY, CONFIGURATION, SIMULATION, SITL, HITL, BENCH_TEST, READY_FOR_FLIGHT, FLIGHT_TEST, FAULT, and EMERGENCY_STOP. Defining a state does not implement its operating mode.

Phase 0 starts disconnected. It exposes no hardware command path, serial probe, configuration write, firmware flash, motor activation, or arming operation. Physical devices are not treated as safe because USB discovery found them. A frontend click cannot grant an unavailable native capability.

The first Betaflight slice will be read only and must verify the selected controller before protocol traffic. Unknown firmware, unexpected identity, communication faults and unsupported capabilities must fail closed. Explicit operator selection and verified identity are different from automatic USB probing.

The emergency state inhibits available software operations. It must never be presented as a guaranteed physical motor stop until such hardware behavior is implemented and measured. A local application cannot promise that an unavailable transport stopped propulsion.

Future hazardous operations require a dedicated native gate, an identified controller/firmware/project, recoverable configuration history, explicit operator action and the relevant checklist: propellers removed, test area clear, emergency stop available, battery verified, outputs disabled initially, correct motor mapping and understood test. No such operation is enabled by the current foundation.

The retained PX4 scripts have their own simulation-only interlocks in `config/safety.yaml`. They remain disabled until the new Phase 1 gate and Phase 2 runtime review pass. The inherited `udp://:14540` URL listens for UDP; it is **not** proof that the peer is local or simulated. Before enabling this runner, constrain network exposure and establish managed simulated-vehicle identity. Do not enable it against an unknown MAVLink endpoint.

No system script invokes elevated installation. Missing packages produce exact manual commands and a nonzero exit before any password prompt. Default operation opens no public remote-control interface.

PASS requires the correct target identity and real measured evidence. Mocks belong only in isolated unit tests and cannot clear hardware or simulator phase gates.

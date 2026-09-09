use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

/// Domain vocabulary for later phase gates. Merely having a variant grants no permission.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SafetyState {
    Disconnected,
    Connected,
    ReadOnly,
    Configuration,
    Simulation,
    Sitl,
    Hitl,
    BenchTest,
    ReadyForFlight,
    FlightTest,
    Fault,
    EmergencyStop,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SafetyStatus {
    pub state: SafetyState,
    pub reason: String,
}

impl Default for SafetyStatus {
    fn default() -> Self {
        Self {
            state: SafetyState::Disconnected,
            reason: "Phase 0: no hardware connection or simulator transport is available.".into(),
        }
    }
}

impl SafetyStatus {
    /// This IPC method is the explicit recovery action. No startup, project selection,
    /// or failure handling path may clear an operator's emergency stop.
    pub fn request_transition(&self, requested: &str) -> Result<Self> {
        let (state, reason) = match requested {
            "DISCONNECTED" => (SafetyState::Disconnected, "Operator explicitly reset the application to DISCONNECTED. Hardware remains unavailable."),
            "FAULT" if self.state != SafetyState::EmergencyStop => (SafetyState::Fault, "Operator recorded an application fault. Explicit reset is required."),
            "EMERGENCY_STOP" => (SafetyState::EmergencyStop, "Application emergency stop is latched. No hardware is connected; this does not stop external equipment. Explicit reset is required."),
            "FAULT" => return Err(AppError::Safety("An emergency stop must be explicitly reset to DISCONNECTED before changing state".into())),
            _ => return Err(AppError::Safety("Phase 0 only permits DISCONNECTED, FAULT and EMERGENCY_STOP".into())),
        };
        Ok(Self { state, reason: reason.into() })
    }

    pub fn fault(&mut self, reason: String) {
        if self.state != SafetyState::EmergencyStop {
            self.state = SafetyState::Fault;
            self.reason = reason;
        }
    }

    pub fn validate_stored(&self) -> Result<()> {
        if matches!(self.state, SafetyState::Disconnected | SafetyState::Fault | SafetyState::EmergencyStop) {
            Ok(())
        } else {
            Err(AppError::Integrity("Stored safety state is not permitted in Phase 0; startup refused".into()))
        }
    }

    /// Deliberate deny-all boundary: no Phase 0 state authorizes a physical operation.
    pub fn authorize_hardware(&self, operation: HardwareOperation) -> Result<()> {
        Err(AppError::Unavailable(format!("{operation:?} is disabled in Phase 0 (state {:?})", self.state)))
    }
}

#[derive(Debug, Clone, Copy)]
pub enum HardwareOperation {
    Discover,
    Connect,
    ReadConfiguration,
    WriteConfiguration,
    FlashFirmware,
    Arm,
    MotorTest,
    ActuatorCommand,
    FlightTest,
}


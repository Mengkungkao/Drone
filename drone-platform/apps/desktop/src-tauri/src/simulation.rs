//! Simulation is a separate application port, not a flight-controller adapter.
use crate::{adapters::{AdapterDescriptor, AdapterStatus}, error::Result};
use std::time::Duration;

pub struct SimulationEnvironment {
    pub engine_version: String,
    pub model: String,
}

pub trait SimulationEngine: Send {
    fn descriptor(&self) -> AdapterDescriptor;
    fn inspect_environment(&self, timeout: Duration) -> Result<SimulationEnvironment>;
    fn stop(&mut self, timeout: Duration) -> Result<()>;
}

pub fn gazebo_descriptor() -> AdapterDescriptor {
    AdapterDescriptor {
        id: "gazebo".into(), name: "Simulation Engine".into(), protocol: "Gazebo Harmonic".into(),
        target: "X500 / PX4 SITL".into(), status: AdapterStatus::Unavailable,
        reason: "Phase 2: the Gazebo environment, X500 launch and measured telemetry gate have not been verified.".into(),
        capabilities: vec![],
    }
}

//! Firmware integration contracts only. No serial device, protocol client, or fake
//! adapter is instantiated in Phase 0. Available capabilities must reflect runtime support.
use serde::Serialize;
use std::time::Duration;

use crate::{domain::ConfigurationValues, error::Result};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AdapterStatus {
    Unavailable,
    Planned,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterDescriptor {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub target: String,
    pub status: AdapterStatus,
    pub reason: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ControllerIdentity {
    pub board: String,
    pub firmware: String,
    pub version: String,
}

/// Future implementors must verify identity before exposing read-only data.
/// No control, flashing, CLI, or configuration-write method exists in this contract.
/// Every operation must return an error by its timeout and close failed transports.
pub trait FlightControllerAdapter: Send {
    fn descriptor(&self) -> AdapterDescriptor;
    fn identify(&mut self, timeout: Duration) -> Result<ControllerIdentity>;
    fn read_configuration(&mut self, timeout: Duration) -> Result<ConfigurationValues>;
    fn disconnect(&mut self, timeout: Duration) -> Result<()>;
}

pub fn flight_controller_catalog() -> Vec<AdapterDescriptor> {
    vec![
        AdapterDescriptor {
            id: "betaflight".into(), name: "Betaflight Adapter".into(), protocol: "MSP / USB serial".into(),
            target: "Real flight controller".into(), status: AdapterStatus::Unavailable,
            reason: "Phase 1: verified controller discovery and read-only MSP transport have not been implemented.".into(), capabilities: vec![],
        },
        AdapterDescriptor {
            id: "px4".into(), name: "PX4 Adapter".into(), protocol: "MAVLink / MAVSDK".into(),
            target: "PX4 flight controller / SITL".into(), status: AdapterStatus::Unavailable,
            reason: "Phase 2: MAVLink transport and measured SITL validation have not been implemented.".into(), capabilities: vec![],
        },
        AdapterDescriptor {
            id: "ardupilot".into(), name: "ArduPilot Adapter".into(), protocol: "MAVLink".into(),
            target: "ArduPilot flight controller".into(), status: AdapterStatus::Planned,
            reason: "Future firmware integration; no transport implementation.".into(), capabilities: vec![],
        },
        AdapterDescriptor {
            id: "custom".into(), name: "Custom Firmware Adapter".into(), protocol: "To be defined".into(),
            target: "Custom flight controller".into(), status: AdapterStatus::Planned,
            reason: "Future adapter extension point; no transport implementation.".into(), capabilities: vec![],
        },
    ]
}

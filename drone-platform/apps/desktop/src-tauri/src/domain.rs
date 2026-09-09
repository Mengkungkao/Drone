use std::collections::BTreeMap;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    Physical,
    Simulated,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Firmware {
    Betaflight,
    Px4,
    Ardupilot,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DroneProject {
    pub id: String,
    pub name: String,
    pub kind: ProjectKind,
    pub firmware: Firmware,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
    pub configuration_revision: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateProjectInput {
    pub name: String,
    pub kind: ProjectKind,
    pub firmware: Firmware,
    pub description: String,
}

impl CreateProjectInput {
    pub fn into_project(self) -> Result<DroneProject> {
        let name = validate_text("Project name", &self.name, 120, false)?;
        let description = validate_text("Description", &self.description, 4000, true)?;
        let timestamp = now();
        Ok(DroneProject {
            id: new_id(),
            name,
            kind: self.kind,
            firmware: self.firmware,
            description,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            configuration_revision: 0,
        })
    }
}

pub type ConfigurationValues = BTreeMap<String, Value>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationSnapshot {
    pub id: String,
    pub project_id: String,
    pub revision: u32,
    pub label: String,
    pub values: ConfigurationValues,
    pub created_at: String,
}

pub fn validate_snapshot(label: &str, values: &ConfigurationValues) -> Result<String> {
    let label = validate_text("Snapshot label", label, 120, false)?;
    if values.is_empty() || values.len() > 256 {
        return Err(AppError::Validation("A snapshot requires 1 to 256 configuration fields".into()));
    }
    for (key, value) in values {
        let normalized = validate_text("Configuration field name", key, 128, false)?;
        if normalized != *key || key.chars().any(char::is_control) || matches!(key.as_str(), "__proto__" | "constructor" | "prototype") {
            return Err(AppError::Validation("Configuration keys cannot have edge whitespace or control characters".into()));
        }
        match value {
            Value::String(text) => {
                if text.chars().count() > 4096 || text.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
                    return Err(AppError::Validation("Configuration strings must have at most 4096 characters and no unsupported control characters".into()));
                }
                validate_text("Configuration value", text, 4096, true)?;
            }
            Value::Bool(_) => {}
            Value::Number(number) if number.as_f64().is_some_and(f64::is_finite) => {}
            _ => return Err(AppError::Validation("Configuration values must be strings, finite numbers or booleans".into())),
        }
    }
    if serde_json::to_vec(values)?.len() > 65_536 {
        return Err(AppError::Validation("Configuration snapshot exceeds 64 KiB".into()));
    }
    Ok(label)
}

pub fn validate_project_id(value: &str) -> Result<()> {
    if value.len() != 36 || Uuid::parse_str(value).is_err() {
        return Err(AppError::Validation("Project ID must be a UUID".into()));
    }
    Ok(())
}

fn validate_text(label: &str, value: &str, maximum: usize, allow_empty: bool) -> Result<String> {
    if value.len() > maximum * 4 {
        return Err(AppError::Validation(format!("{label} exceeds {maximum} characters")));
    }
    let normalized = value.trim();
    if (!allow_empty && normalized.is_empty()) || normalized.chars().count() > maximum {
        return Err(AppError::Validation(format!("{label} must contain {} to {maximum} characters", if allow_empty { 0 } else { 1 })));
    }
    if normalized.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
        return Err(AppError::Validation(format!("{label} contains unsupported control characters")));
    }
    Ok(normalized.to_owned())
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuditLevel {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub timestamp: String,
    pub level: AuditLevel,
    pub operation: String,
    pub message: String,
}

impl AuditEvent {
    pub fn new(level: AuditLevel, operation: &str, message: String) -> Self {
        Self { id: new_id(), timestamp: now(), level, operation: operation.into(), message }
    }
}

pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

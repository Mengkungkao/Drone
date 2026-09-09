use std::{fs, path::Path};

use serde::Serialize;

use crate::{
    adapters::{flight_controller_catalog, AdapterDescriptor},
    domain::{validate_project_id, validate_snapshot, AuditEvent, AuditLevel, ConfigurationSnapshot, ConfigurationValues, CreateProjectInput, DroneProject},
    error::{AppError, Result},
    infrastructure::{logging::SessionLog, store::ProjectStore},
    safety::{SafetyState, SafetyStatus},
    simulation::gazebo_descriptor,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub projects: Vec<DroneProject>,
    pub selected_project_id: Option<String>,
    pub safety: SafetyStatus,
    pub adapters: Vec<AdapterDescriptor>,
    pub logs: Vec<AuditEvent>,
}

/// Owns application policy and persistence. No process launcher, device transport,
/// serial handle, or network client is available to this service in Phase 0.
pub struct WorkspaceService {
    store: ProjectStore,
    safety: SafetyStatus,
    session_log: SessionLog,
}

impl WorkspaceService {
    pub fn open(data_directory: &Path) -> Result<Self> {
        fs::create_dir_all(data_directory)?;
        let store = ProjectStore::open(&data_directory.join("dronelab.sqlite3"))?;
        let safety = store.safety()?;
        let session_log = SessionLog::open(&data_directory.join("logs"))?;
        let mut service = Self { store, safety, session_log };
        let event = AuditEvent::new(AuditLevel::Info, "application_start", format!(
            "DroneLab {} started on {} / {}; Phase 0 hardware and simulation transports are unavailable.",
            env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH,
        ));
        service.store.append_audit(&event)?;
        service.write_session_event(&event)?;
        Ok(service)
    }

    pub fn workspace(&mut self) -> Result<WorkspaceState> {
        // Another local app instance may have latched a stricter state. Reading
        // the workspace never clears this process's fault or emergency latch.
        let stored = self.store.safety()?;
        if stored.state == SafetyState::EmergencyStop || self.safety.state == SafetyState::Disconnected {
            self.safety = stored;
        }
        let mut adapters = flight_controller_catalog();
        adapters.push(gazebo_descriptor());
        Ok(WorkspaceState {
            projects: self.store.projects()?, selected_project_id: self.store.selected_project_id()?,
            safety: self.safety.clone(), adapters, logs: self.store.recent_audit()?,
        })
    }

    pub fn create_project(&mut self, input: CreateProjectInput) -> Result<DroneProject> {
        let project = input.into_project()?;
        let event = AuditEvent::new(AuditLevel::Info, "create_project", format!("Created and selected local project {}. No flight controller was contacted.", project.id));
        self.store.create_project(&project, &event)?;
        self.write_session_event(&event)?;
        Ok(project)
    }

    pub fn select_project(&mut self, project_id: &str) -> Result<DroneProject> {
        validate_project_id(project_id)?;
        let event = AuditEvent::new(AuditLevel::Info, "select_project", format!("Selected local project {project_id}. Safety state is unchanged."));
        let project = self.store.select_project(project_id, &event)?;
        self.write_session_event(&event)?;
        Ok(project)
    }

    pub fn save_snapshot(&mut self, project_id: &str, label: &str, values: ConfigurationValues) -> Result<ConfigurationSnapshot> {
        validate_project_id(project_id)?;
        let label = validate_snapshot(label, &values)?;
        let event = AuditEvent::new(AuditLevel::Info, "save_snapshot", format!("Saved a local configuration revision for {project_id}. Previous revisions retained. No configuration was written to hardware."));
        let snapshot = self.store.save_snapshot(project_id, label, values, &event)?;
        self.write_session_event(&event)?;
        Ok(snapshot)
    }

    pub fn list_snapshots(&self, project_id: &str) -> Result<Vec<ConfigurationSnapshot>> {
        validate_project_id(project_id)?;
        self.store.snapshots(project_id)
    }

    pub fn set_safety_state(&mut self, requested: &str) -> Result<SafetyStatus> {
        // An operator stop must latch even when the first database read fails.
        if requested == "EMERGENCY_STOP" {
            self.safety = self.safety.request_transition(requested)?;
        }
        let stored = self.store.safety()?;
        if stored.state == SafetyState::EmergencyStop {
            self.safety = stored;
        }
        let next = self.safety.request_transition(requested)?;
        let level = if next.state == SafetyState::Disconnected { AuditLevel::Info } else { AuditLevel::Warning };
        let event = AuditEvent::new(level, "set_safety_state", next.reason.clone());
        self.store.update_safety(&next, &event)?;
        self.safety = next;
        self.write_session_event(&event)?;
        Ok(self.safety.clone())
    }

    /// Command boundary: preserve and expose failures instead of reporting success.
    /// If audit persistence also fails, the caller receives both errors.
    pub fn report_error(&mut self, operation: &str, error: &AppError) -> String {
        let mut message = error.to_string();
        let event = AuditEvent::new(AuditLevel::Error, operation, message.clone());
        let database_result = if error.is_critical() {
            self.safety.fault(format!("Native operation failed: {operation}. Inspect the audit log and explicitly reset after recovery."));
            self.store.update_safety(&self.safety, &event)
        } else {
            self.store.append_audit(&event)
        };
        if let Err(audit_error) = database_result {
            message.push_str(&format!("; could not persist audit event: {audit_error}"));
        }
        if let Err(log_error) = self.session_log.append(&event) {
            self.safety.fault("Session logging failed; explicit reset is required after storage recovery.".into());
            message.push_str(&format!("; could not append session log: {log_error}"));
        }
        eprintln!("DroneLab {operation}: {message}");
        message
    }

    fn write_session_event(&mut self, event: &AuditEvent) -> Result<()> {
        self.session_log.append(event).map_err(|error| AppError::Integrity(format!(
            "Operation was saved in SQLite, but the session log could not be written: {error}. Refresh the workspace before retrying."
        )))
    }
}

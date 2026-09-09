use std::sync::Mutex;

use tauri::State;

use crate::{
    application::{WorkspaceService, WorkspaceState},
    domain::{ConfigurationSnapshot, ConfigurationValues, CreateProjectInput, DroneProject},
    error::Result,
    safety::SafetyStatus,
};

type Backend<'a> = State<'a, Mutex<WorkspaceService>>;

fn with_service<T>(backend: Backend<'_>, operation: &str, action: impl FnOnce(&mut WorkspaceService) -> Result<T>) -> std::result::Result<T, String> {
    let mut service = backend.lock().map_err(|_| "Native application state is unavailable after an internal failure. Restart DroneLab; hardware operations remain disabled.".to_owned())?;
    action(&mut service).map_err(|error| service.report_error(operation, &error))
}

#[tauri::command(async)]
pub fn get_workspace(backend: Backend<'_>) -> std::result::Result<WorkspaceState, String> {
    with_service(backend, "get_workspace", WorkspaceService::workspace)
}

#[tauri::command(async)]
pub fn create_project(backend: Backend<'_>, input: CreateProjectInput) -> std::result::Result<DroneProject, String> {
    with_service(backend, "create_project", |service| service.create_project(input))
}

#[tauri::command(async)]
pub fn select_project(backend: Backend<'_>, project_id: String) -> std::result::Result<DroneProject, String> {
    with_service(backend, "select_project", |service| service.select_project(&project_id))
}

#[tauri::command(async)]
pub fn save_snapshot(backend: Backend<'_>, project_id: String, label: String, values: ConfigurationValues) -> std::result::Result<ConfigurationSnapshot, String> {
    with_service(backend, "save_snapshot", |service| service.save_snapshot(&project_id, &label, values))
}

#[tauri::command(async)]
pub fn list_snapshots(backend: Backend<'_>, project_id: String) -> std::result::Result<Vec<ConfigurationSnapshot>, String> {
    with_service(backend, "list_snapshots", |service| service.list_snapshots(&project_id))
}

#[tauri::command(async)]
pub fn set_safety_state(backend: Backend<'_>, state: String) -> std::result::Result<SafetyStatus, String> {
    with_service(backend, "set_safety_state", |service| service.set_safety_state(&state))
}

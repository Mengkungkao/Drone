use dronelab::{
    adapters::flight_controller_catalog,
    application::WorkspaceService,
    domain::{validate_project_id, validate_snapshot, AuditEvent, AuditLevel, ConfigurationValues, CreateProjectInput, Firmware, ProjectKind},
    error::AppError,
    infrastructure::store::ProjectStore,
    safety::{HardwareOperation, SafetyState, SafetyStatus},
    simulation::gazebo_descriptor,
};
use rusqlite::Connection;
use serde_json::json;
use tempfile::tempdir;

fn input(name: &str) -> CreateProjectInput {
    CreateProjectInput { name: name.into(), kind: ProjectKind::Simulated, firmware: Firmware::Px4, description: "Engineering test fixture, no telemetry".into() }
}

fn values(mass: f64) -> ConfigurationValues {
    serde_json::from_value(json!({ "massKg": mass, "frame": "X500", "propellersRemoved": true })).unwrap()
}

fn event(operation: &str) -> AuditEvent {
    AuditEvent::new(AuditLevel::Info, operation, "Test fixture event".into())
}

#[test]
fn project_selection_configuration_history_and_audit_survive_restart() {
    let directory = tempdir().unwrap();
    let project_id;
    {
        let mut service = WorkspaceService::open(directory.path()).unwrap();
        assert!(service.workspace().unwrap().projects.is_empty());
        let project = service.create_project(input(" X500 engineering ")).unwrap();
        assert_eq!(project.name, "X500 engineering");
        project_id = project.id;
        let first = service.save_snapshot(&project_id, "Baseline", values(1.8)).unwrap();
        let second = service.save_snapshot(&project_id, "Payload experiment", values(2.1)).unwrap();
        assert_eq!((first.revision, second.revision), (1, 2));
        assert_ne!(first.id, second.id);
        let other = service.create_project(input("Second airframe")).unwrap();
        assert_eq!(service.workspace().unwrap().selected_project_id, Some(other.id));
        service.select_project(&project_id).unwrap();
    }
    let mut reopened = WorkspaceService::open(directory.path()).unwrap();
    let workspace = reopened.workspace().unwrap();
    assert_eq!(workspace.projects.len(), 2);
    assert_eq!(workspace.selected_project_id.as_deref(), Some(project_id.as_str()));
    assert_eq!(workspace.projects.iter().find(|project| project.id == project_id).unwrap().configuration_revision, 2);
    let snapshots = reopened.list_snapshots(&project_id).unwrap();
    assert_eq!(snapshots.len(), 2);
    assert_eq!(snapshots[0].values["massKg"], json!(2.1));
    assert_eq!(snapshots[1].values["massKg"], json!(1.8));
    assert!(workspace.logs.iter().any(|event| event.operation == "save_snapshot"));
    let session_directories = std::fs::read_dir(directory.path().join("logs")).unwrap().count();
    assert_eq!(session_directories, 2, "Restart must retain the previous session's logs");
}

#[test]
fn project_and_snapshot_mutations_roll_back_when_audit_insert_fails() {
    let directory = tempdir().unwrap();
    let mut store = ProjectStore::open(&directory.path().join("projects.sqlite3")).unwrap();
    let first = input("First").into_project().unwrap();
    let reused_event = event("create_project");
    store.create_project(&first, &reused_event).unwrap();
    let second = input("Second").into_project().unwrap();
    assert!(store.create_project(&second, &reused_event).is_err());
    assert_eq!(store.projects().unwrap().len(), 1);
    assert_eq!(store.selected_project_id().unwrap(), Some(first.id.clone()));
    assert!(store.save_snapshot(&first.id, "Failed write".into(), values(2.0), &reused_event).is_err());
    assert!(store.snapshots(&first.id).unwrap().is_empty());
    assert_eq!(store.project(&first.id).unwrap().configuration_revision, 0);
}

#[test]
fn snapshots_are_immutable_even_through_direct_sql() {
    let directory = tempdir().unwrap();
    let database = directory.path().join("projects.sqlite3");
    let mut store = ProjectStore::open(&database).unwrap();
    let project = input("Retained history").into_project().unwrap();
    store.create_project(&project, &event("create_project")).unwrap();
    store.save_snapshot(&project.id, "Baseline".into(), values(1.8), &event("save_snapshot")).unwrap();
    let direct = Connection::open(database).unwrap();
    assert!(direct.execute("UPDATE configuration_snapshots SET label='Overwritten'", []).is_err());
    assert!(direct.execute("DELETE FROM configuration_snapshots", []).is_err());
    assert_eq!(store.snapshots(&project.id).unwrap()[0].label, "Baseline");
}

#[test]
fn separate_connections_allocate_unique_contiguous_revisions() {
    let directory = tempdir().unwrap();
    let database = directory.path().join("projects.sqlite3");
    let mut first_store = ProjectStore::open(&database).unwrap();
    let mut second_store = ProjectStore::open(&database).unwrap();
    let project = input("Shared database").into_project().unwrap();
    first_store.create_project(&project, &event("create_project")).unwrap();
    let first = first_store.save_snapshot(&project.id, "First".into(), values(1.0), &event("save_snapshot")).unwrap();
    let second = second_store.save_snapshot(&project.id, "Second".into(), values(2.0), &event("save_snapshot")).unwrap();
    assert_eq!((first.revision, second.revision), (1, 2));
}

#[test]
fn migration_upgrade_preserves_existing_project_and_records_versions_once() {
    let directory = tempdir().unwrap();
    let database = directory.path().join("projects.sqlite3");
    {
        let connection = Connection::open(&database).unwrap();
        connection.execute_batch(include_str!("../migrations/001_projects.sql")).unwrap();
        connection.execute("INSERT INTO migration_history VALUES (1,'2026-01-01T00:00:00Z')", []).unwrap();
        connection.execute("INSERT INTO projects VALUES ('34d8f8d8-eaea-4efa-8ce8-75877f42890b','Retained','physical','betaflight','','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0)", []).unwrap();
        connection.pragma_update(None, "user_version", 1).unwrap();
    }
    let store = ProjectStore::open(&database).unwrap();
    assert_eq!(store.projects().unwrap()[0].name, "Retained");
    assert_eq!(store.safety().unwrap().state, SafetyState::Disconnected);
    drop(store);
    drop(ProjectStore::open(&database).unwrap());
    let connection = Connection::open(database).unwrap();
    assert_eq!(connection.query_row("SELECT count(*) FROM migration_history", [], |row| row.get::<_, i64>(0)).unwrap(), 2);
    assert_eq!(connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)).unwrap(), 2);
}

#[test]
fn future_database_schema_is_rejected_without_modification() {
    let directory = tempdir().unwrap();
    let database = directory.path().join("future.sqlite3");
    let connection = Connection::open(&database).unwrap();
    connection.pragma_update(None, "user_version", 99).unwrap();
    assert!(matches!(ProjectStore::open(&database), Err(AppError::NewerSchema(99))));
    assert_eq!(connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)).unwrap(), 99);
}

#[test]
fn emergency_stop_is_latched_across_restart_selection_and_creation() {
    let directory = tempdir().unwrap();
    {
        let mut service = WorkspaceService::open(directory.path()).unwrap();
        service.set_safety_state("EMERGENCY_STOP").unwrap();
        let project = service.create_project(input("No implicit recovery")).unwrap();
        service.select_project(&project.id).unwrap();
        assert_eq!(service.workspace().unwrap().safety.state, SafetyState::EmergencyStop);
        assert!(service.set_safety_state("FAULT").is_err());
    }
    let mut service = WorkspaceService::open(directory.path()).unwrap();
    assert_eq!(service.workspace().unwrap().safety.state, SafetyState::EmergencyStop);
    assert_eq!(service.set_safety_state("DISCONNECTED").unwrap().state, SafetyState::Disconnected);
}

#[test]
fn all_non_foundation_safety_modes_are_denied() {
    let status = SafetyStatus::default();
    for mode in ["CONNECTED", "READ_ONLY", "CONFIGURATION", "SIMULATION", "SITL", "HITL", "BENCH_TEST", "READY_FOR_FLIGHT", "FLIGHT_TEST", "", "disconnected", "ARMED"] {
        assert!(status.request_transition(mode).is_err(), "{mode} unexpectedly allowed");
    }
    assert_eq!(status.state, SafetyState::Disconnected);
}

#[test]
fn emergency_stop_latches_even_when_the_database_cannot_be_read() {
    let directory = tempdir().unwrap();
    let mut service = WorkspaceService::open(directory.path()).unwrap();
    let connection = Connection::open(directory.path().join("dronelab.sqlite3")).unwrap();
    // Test-only fault injection: simulate storage damage before the operator stop.
    connection.execute("DROP TABLE safety_status", []).unwrap();
    let failure = service.set_safety_state("EMERGENCY_STOP").unwrap_err();
    service.report_error("set_safety_state", &failure);
    // Restoring accessible storage must not implicitly clear the in-memory latch.
    connection.execute_batch(include_str!("../migrations/002_safety.sql")).unwrap();
    assert_eq!(service.workspace().unwrap().safety.state, SafetyState::EmergencyStop);
    assert_eq!(service.set_safety_state("DISCONNECTED").unwrap().state, SafetyState::Disconnected);
}

#[test]
fn hardware_authorization_is_denied_in_every_domain_state() {
    let states = [SafetyState::Disconnected, SafetyState::Connected, SafetyState::ReadOnly, SafetyState::Configuration, SafetyState::Simulation, SafetyState::Sitl, SafetyState::Hitl, SafetyState::BenchTest, SafetyState::ReadyForFlight, SafetyState::FlightTest, SafetyState::Fault, SafetyState::EmergencyStop];
    let operations = [HardwareOperation::Discover, HardwareOperation::Connect, HardwareOperation::ReadConfiguration, HardwareOperation::WriteConfiguration, HardwareOperation::FlashFirmware, HardwareOperation::Arm, HardwareOperation::MotorTest, HardwareOperation::ActuatorCommand, HardwareOperation::FlightTest];
    for state in states {
        let status = SafetyStatus { state, reason: "Test fixture".into() };
        for operation in operations {
            assert!(status.authorize_hardware(operation).is_err());
        }
    }
}

#[test]
fn a_second_process_cannot_downgrade_a_persisted_emergency_stop_to_fault() {
    let directory = tempdir().unwrap();
    let database = directory.path().join("projects.sqlite3");
    let mut first = ProjectStore::open(&database).unwrap();
    let mut second = ProjectStore::open(&database).unwrap();
    let stale_fault = second.safety().unwrap().request_transition("FAULT").unwrap();
    let stop = first.safety().unwrap().request_transition("EMERGENCY_STOP").unwrap();
    first.update_safety(&stop, &event("set_safety_state")).unwrap();
    assert!(second.update_safety(&stale_fault, &event("set_safety_state")).is_err());
    assert_eq!(first.safety().unwrap().state, SafetyState::EmergencyStop);
}

#[test]
fn critical_error_latches_fault_and_is_audited_without_clearing_emergency_stop() {
    let directory = tempdir().unwrap();
    let mut service = WorkspaceService::open(directory.path()).unwrap();
    let fault = AppError::Integrity("Test-injected storage integrity error".into());
    assert!(service.report_error("test_failure", &fault).contains("storage integrity"));
    assert_eq!(service.workspace().unwrap().safety.state, SafetyState::Fault);
    assert!(service.workspace().unwrap().logs.iter().any(|log| log.operation == "test_failure" && log.level == AuditLevel::Error));
    service.set_safety_state("EMERGENCY_STOP").unwrap();
    service.report_error("test_failure", &fault);
    assert_eq!(service.workspace().unwrap().safety.state, SafetyState::EmergencyStop);
}

#[test]
fn native_validation_rejects_invalid_external_inputs() {
    assert!(input(" \n ").into_project().is_err());
    assert!(input(&"x".repeat(121)).into_project().is_err());
    assert!(input("Name\0").into_project().is_err());
    assert!(validate_project_id("../../database").is_err());
    assert!(serde_json::from_value::<CreateProjectInput>(json!({ "name": "Project", "kind": "unknown", "firmware": "px4", "description": "" })).is_err());
    assert!(serde_json::from_value::<CreateProjectInput>(json!({ "name": "Project", "kind": "physical", "firmware": "px4", "description": "", "arm": true })).is_err());
    for payload in [json!({}), json!({"massKg": null}), json!({"massKg": [1,2]}), json!({"massKg": {"value": 1}}), json!({" massKg ": 1}), json!({"__proto__": "unsafe"}), json!({"field": "x".repeat(4097)}), json!({"field": " ".repeat(4097)}), json!({"field": "\rvalue\r"})] {
        let values: ConfigurationValues = serde_json::from_value(payload).unwrap();
        assert!(validate_snapshot("Invalid fixture", &values).is_err());
    }
    let too_many: ConfigurationValues = (0..257).map(|index| (format!("field{index}"), json!(true))).collect();
    assert!(validate_snapshot("Too many", &too_many).is_err());
    assert!(validate_snapshot("Valid", &values(1.8)).is_ok());
}

#[test]
fn catalog_cannot_claim_implemented_capabilities() {
    let mut catalog = flight_controller_catalog();
    catalog.push(gazebo_descriptor());
    assert_eq!(catalog.len(), 5);
    for descriptor in catalog {
        assert!(descriptor.capabilities.is_empty());
        assert!(!descriptor.reason.is_empty());
    }
}

#[test]
fn workspace_serialization_matches_the_frontend_ipc_contract() {
    let directory = tempdir().unwrap();
    let mut service = WorkspaceService::open(directory.path()).unwrap();
    let project = service.create_project(input("Contract fixture")).unwrap();
    let payload = serde_json::to_value(service.workspace().unwrap()).unwrap();
    assert_eq!(payload["selectedProjectId"], project.id);
    assert_eq!(payload["safety"]["state"], "DISCONNECTED");
    assert_eq!(payload["projects"][0]["configurationRevision"], 0);
    assert!(payload["projects"][0]["createdAt"].is_string());
    assert_eq!(payload["projects"][0]["firmware"], "px4");
    assert!(payload["logs"][0]["timestamp"].is_string());
}

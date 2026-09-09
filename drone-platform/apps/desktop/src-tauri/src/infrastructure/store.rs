use std::{path::Path, time::Duration};

use rusqlite::{params, types::Type, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::{de::DeserializeOwned, Serialize};

use crate::{
    domain::{new_id, now, AuditEvent, ConfigurationSnapshot, ConfigurationValues, DroneProject},
    error::{AppError, Result},
    safety::SafetyStatus,
};

const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/001_projects.sql"),
    include_str!("../../migrations/002_safety.sql"),
];

pub struct ProjectStore {
    connection: Connection,
}

impl ProjectStore {
    pub fn open(path: &Path) -> Result<Self> {
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(3))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&mut connection)?;
        Ok(Self { connection })
    }

    pub fn projects(&self) -> Result<Vec<DroneProject>> {
        let mut statement = self.connection.prepare(
            "SELECT id,name,kind,firmware,description,created_at,updated_at,configuration_revision
             FROM projects ORDER BY created_at DESC, id",
        )?;
        let rows = statement.query_map([], project_from_row)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn project(&self, id: &str) -> Result<DroneProject> {
        find_project(&self.connection, id)
    }

    pub fn selected_project_id(&self) -> Result<Option<String>> {
        Ok(self.connection.query_row("SELECT selected_project_id FROM workspace_settings WHERE singleton=1", [], |row| row.get(0))?)
    }

    pub fn create_project(&mut self, project: &DroneProject, event: &AuditEvent) -> Result<()> {
        let transaction = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute(
            "INSERT INTO projects(id,name,kind,firmware,description,created_at,updated_at,configuration_revision)
             VALUES (?1,?2,?3,?4,?5,?6,?7,0)",
            params![project.id, project.name, enum_text(&project.kind)?, enum_text(&project.firmware)?, project.description, project.created_at, project.updated_at],
        )?;
        transaction.execute("UPDATE workspace_settings SET selected_project_id=?1 WHERE singleton=1", [&project.id])?;
        insert_audit(&transaction, event)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn select_project(&mut self, id: &str, event: &AuditEvent) -> Result<DroneProject> {
        let transaction = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let project = find_project(&transaction, id)?;
        transaction.execute("UPDATE workspace_settings SET selected_project_id=?1 WHERE singleton=1", [id])?;
        insert_audit(&transaction, event)?;
        transaction.commit()?;
        Ok(project)
    }

    pub fn save_snapshot(&mut self, project_id: &str, label: String, values: ConfigurationValues, event: &AuditEvent) -> Result<ConfigurationSnapshot> {
        let transaction = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let project = find_project(&transaction, project_id)?;
        let revision = project.configuration_revision.checked_add(1)
            .ok_or_else(|| AppError::Integrity("Configuration revision limit reached".into()))?;
        let snapshot = ConfigurationSnapshot {
            id: new_id(), project_id: project_id.into(), revision, label, values, created_at: now(),
        };
        transaction.execute(
            "INSERT INTO configuration_snapshots(id,project_id,revision,label,values_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![snapshot.id, snapshot.project_id, snapshot.revision, snapshot.label, serde_json::to_string(&snapshot.values)?, snapshot.created_at],
        )?;
        transaction.execute("UPDATE projects SET configuration_revision=?1,updated_at=?2 WHERE id=?3", params![revision, snapshot.created_at, project_id])?;
        insert_audit(&transaction, event)?;
        transaction.commit()?;
        Ok(snapshot)
    }

    pub fn snapshots(&self, project_id: &str) -> Result<Vec<ConfigurationSnapshot>> {
        self.project(project_id)?;
        let mut statement = self.connection.prepare(
            "SELECT id,project_id,revision,label,values_json,created_at FROM configuration_snapshots WHERE project_id=?1 ORDER BY revision DESC",
        )?;
        let rows = statement.query_map([project_id], |row| {
            let json: String = row.get(4)?;
            let values = serde_json::from_str(&json).map_err(|error| rusqlite::Error::FromSqlConversionFailure(4, Type::Text, Box::new(error)))?;
            Ok(ConfigurationSnapshot { id: row.get(0)?, project_id: row.get(1)?, revision: row.get(2)?, label: row.get(3)?, values, created_at: row.get(5)? })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn safety(&self) -> Result<SafetyStatus> {
        let status = self.connection.query_row("SELECT state,reason FROM safety_status WHERE singleton=1", [], |row| {
            Ok(SafetyStatus { state: decode_enum(row, 0)?, reason: row.get(1)? })
        })?;
        status.validate_stored()?;
        Ok(status)
    }

    pub fn update_safety(&mut self, status: &SafetyStatus, event: &AuditEvent) -> Result<()> {
        status.validate_stored()?;
        let transaction = self.connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current: String = transaction.query_row("SELECT state FROM safety_status WHERE singleton=1", [], |row| row.get(0))?;
        if current == "EMERGENCY_STOP" && status.state == crate::safety::SafetyState::Fault {
            return Err(AppError::Safety("Persisted emergency stop cannot be downgraded to FAULT; explicit reset is required".into()));
        }
        let changed = transaction.execute("UPDATE safety_status SET state=?1,reason=?2 WHERE singleton=1", params![enum_text(&status.state)?, status.reason])?;
        if changed != 1 {
            return Err(AppError::Integrity("Safety state record is missing".into()));
        }
        insert_audit(&transaction, event)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn append_audit(&self, event: &AuditEvent) -> Result<()> {
        insert_audit(&self.connection, event)
    }

    pub fn recent_audit(&self) -> Result<Vec<AuditEvent>> {
        let mut statement = self.connection.prepare("SELECT id,timestamp,level,operation,message FROM audit_events ORDER BY sequence DESC LIMIT 200")?;
        let rows = statement.query_map([], |row| Ok(AuditEvent {
            id: row.get(0)?, timestamp: row.get(1)?, level: decode_enum(row, 2)?, operation: row.get(3)?, message: row.get(4)?,
        }))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

fn migrate(connection: &mut Connection) -> Result<()> {
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 0 || version > MIGRATIONS.len() as i64 {
        return Err(AppError::NewerSchema(version));
    }
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute_batch(sql)?;
        transaction.execute("INSERT INTO migration_history(version,applied_at) VALUES (?1,?2)", params![(index + 1) as i64, now()])?;
        transaction.pragma_update(None, "user_version", (index + 1) as i64)?;
        transaction.commit()?;
    }
    Ok(())
}

fn find_project(connection: &Connection, id: &str) -> Result<DroneProject> {
    connection.query_row(
        "SELECT id,name,kind,firmware,description,created_at,updated_at,configuration_revision FROM projects WHERE id=?1",
        [id], project_from_row,
    ).optional()?.ok_or(AppError::ProjectNotFound)
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<DroneProject> {
    Ok(DroneProject {
        id: row.get(0)?, name: row.get(1)?, kind: decode_enum(row, 2)?, firmware: decode_enum(row, 3)?,
        description: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?, configuration_revision: row.get(7)?,
    })
}

fn enum_text(value: &impl Serialize) -> Result<String> {
    serde_json::to_value(value)?.as_str().map(str::to_owned)
        .ok_or_else(|| AppError::Integrity("Expected a string enum".into()))
}

fn decode_enum<T: DeserializeOwned>(row: &Row<'_>, index: usize) -> rusqlite::Result<T> {
    let value: String = row.get(index)?;
    serde_json::from_value(serde_json::Value::String(value))
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error)))
}

fn insert_audit(connection: &Connection, event: &AuditEvent) -> Result<()> {
    connection.execute(
        "INSERT INTO audit_events(id,timestamp,level,operation,message) VALUES (?1,?2,?3,?4,?5)",
        params![event.id, event.timestamp, enum_text(&event.level)?, event.operation, event.message],
    )?;
    Ok(())
}

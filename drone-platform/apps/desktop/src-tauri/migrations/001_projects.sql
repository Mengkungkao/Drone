CREATE TABLE migration_history (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    kind TEXT NOT NULL CHECK (kind IN ('physical', 'simulated')),
    firmware TEXT NOT NULL CHECK (firmware IN ('betaflight', 'px4', 'ardupilot', 'custom')),
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    configuration_revision INTEGER NOT NULL DEFAULT 0 CHECK (configuration_revision >= 0)
);

CREATE TABLE configuration_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
    values_json TEXT NOT NULL CHECK (json_valid(values_json) AND json_type(values_json) = 'object'),
    created_at TEXT NOT NULL,
    UNIQUE (project_id, revision)
);

CREATE TRIGGER configuration_snapshots_immutable_update
BEFORE UPDATE ON configuration_snapshots
BEGIN
    SELECT RAISE(ABORT, 'Configuration snapshots are immutable; create a new revision');
END;

CREATE TRIGGER configuration_snapshots_immutable_delete
BEFORE DELETE ON configuration_snapshots
BEGIN
    SELECT RAISE(ABORT, 'Configuration snapshots must be retained');
END;

CREATE TABLE workspace_settings (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    selected_project_id TEXT REFERENCES projects(id)
);
INSERT INTO workspace_settings(singleton, selected_project_id) VALUES (1, NULL);

CREATE TABLE audit_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
    operation TEXT NOT NULL,
    message TEXT NOT NULL
);


"""Real SQLite schema checks; these do NOT verify Rust compilation or native IPC."""
from pathlib import Path
import sqlite3
import tempfile
import unittest


MIGRATIONS = Path(__file__).resolve().parents[1] / "apps/desktop/src-tauri/migrations"


class NativeSchemaTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "projects.sqlite3"
        self.db = sqlite3.connect(self.path)
        self.db.execute("PRAGMA foreign_keys=ON")
        for version, migration in enumerate(sorted(MIGRATIONS.glob("*.sql")), start=1):
            self.db.executescript(migration.read_text(encoding="utf-8"))
            self.db.execute("INSERT INTO migration_history VALUES (?, ?)", (version, "2026-09-09T00:00:00Z"))
            self.db.execute(f"PRAGMA user_version={version}")
        self.db.execute("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)", (
            "project-1", "Engineering rig", "physical", "betaflight", "Schema test only", "2026-09-09", "2026-09-09", 0))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.directory.cleanup()

    def test_schema_survives_reopen_with_project_selection(self):
        self.db.execute("UPDATE workspace_settings SET selected_project_id='project-1'")
        self.db.commit()
        self.db.close()
        self.db = sqlite3.connect(self.path)
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT selected_project_id FROM workspace_settings").fetchone()[0], "project-1")
        self.assertEqual(self.db.execute("SELECT state FROM safety_status").fetchone()[0], "DISCONNECTED")

    def test_schema_rejects_physical_operation_states(self):
        for state in ("CONNECTED", "READ_ONLY", "CONFIGURATION", "SITL", "BENCH_TEST", "FLIGHT_TEST"):
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("UPDATE safety_status SET state=?", (state,))

    def test_snapshots_are_immutable_and_linked_to_existing_projects(self):
        self.db.execute("INSERT INTO configuration_snapshots VALUES (?,?,?,?,?,?)", (
            "s1", "project-1", 1, "Initial", '{"mass":1.5}', "2026-09-09"))
        self.db.commit()
        for statement in (
            "UPDATE configuration_snapshots SET values_json='{}'",
            "DELETE FROM configuration_snapshots",
            "INSERT INTO configuration_snapshots VALUES ('s2','missing',2,'Bad','{}','2026-09-09')",
            "INSERT INTO configuration_snapshots VALUES ('s3','project-1',1,'Duplicate','{}','2026-09-09')",
            "INSERT INTO configuration_snapshots VALUES ('s4','project-1',2,'Array','[]','2026-09-09')",
        ):
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(statement)
        self.assertEqual(self.db.execute("SELECT values_json FROM configuration_snapshots").fetchall(), [('{"mass":1.5}',)])

    def test_revision_and_snapshot_transaction_rolls_back_together(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute("UPDATE projects SET configuration_revision=1 WHERE id='project-1'")
                self.db.execute("INSERT INTO configuration_snapshots VALUES ('s1','missing',1,'Bad','{}','2026-09-09')")
        self.assertEqual(self.db.execute("SELECT configuration_revision FROM projects").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM configuration_snapshots").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()

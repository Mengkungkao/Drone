use std::{fs::{self, File, OpenOptions}, io::Write, path::{Path, PathBuf}};

use chrono::Utc;

use crate::{domain::{new_id, AuditEvent}, error::Result};

/// A unique directory per application run preserves past evidence. SQLite is the
/// canonical audit history; JSONL provides independently inspectable session logs.
pub struct SessionLog {
    file: File,
    pub directory: PathBuf,
}

impl SessionLog {
    pub fn open(log_root: &Path) -> Result<Self> {
        let directory = log_root.join(format!("{}_{}", Utc::now().format("%Y-%m-%d_%H%M%S"), new_id()));
        fs::create_dir_all(&directory)?;
        let file = OpenOptions::new().create_new(true).write(true).open(directory.join("application.jsonl"))?;
        Ok(Self { file, directory })
    }

    pub fn append(&mut self, event: &AuditEvent) -> Result<()> {
        let mut line = serde_json::to_vec(event)?;
        line.push(b'\n');
        self.file.write_all(&line)?;
        self.file.flush()?;
        Ok(())
    }
}


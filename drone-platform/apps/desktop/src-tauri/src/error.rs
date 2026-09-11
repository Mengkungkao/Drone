#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid input: {0}")]
    Validation(String),
    #[error("Project was not found")]
    ProjectNotFound,
    #[error("Operation unavailable: {0}")]
    Unavailable(String),
    #[error("Safety transition denied: {0}")]
    Safety(String),
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("File operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Stored data could not be decoded: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Database schema version {0} is newer than this application supports; use the newer application")]
    NewerSchema(i64),
    #[error("{0}")]
    Integrity(String),
    #[error("Protocol error: {0}")]
    Protocol(String),
}

pub type Result<T> = std::result::Result<T, AppError>;

impl AppError {
    /// Critical errors latch a FAULT the operator must clear. Storage and integrity
    /// failures qualify because the application can no longer trust its own state.
    /// A protocol error does not: a malformed frame says something about the device or
    /// the cable, and the right response is to fail that read closed and report it, not
    /// to put the whole workspace into a state needing manual recovery.
    pub fn is_critical(&self) -> bool {
        matches!(
            self,
            Self::Database(_) | Self::Io(_) | Self::Json(_) | Self::NewerSchema(_) | Self::Integrity(_)
        )
    }
}


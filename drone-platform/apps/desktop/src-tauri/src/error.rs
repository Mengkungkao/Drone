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
}

pub type Result<T> = std::result::Result<T, AppError>;

impl AppError {
    pub fn is_critical(&self) -> bool {
        matches!(
            self,
            Self::Database(_) | Self::Io(_) | Self::Json(_) | Self::NewerSchema(_) | Self::Integrity(_)
        )
    }
}


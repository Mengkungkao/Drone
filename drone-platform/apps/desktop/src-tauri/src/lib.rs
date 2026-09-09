pub mod adapters;
pub mod application;
pub mod domain;
pub mod error;
pub mod infrastructure;
pub mod safety;
pub mod simulation;

#[cfg(feature = "desktop")]
mod commands;

#[cfg(feature = "desktop")]
pub fn run() {
    use std::sync::Mutex;
    use tauri::Manager;

    tauri::Builder::default()
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            let service = application::WorkspaceService::open(&data_directory)?;
            app.manage(Mutex::new(service));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_workspace,
            commands::create_project,
            commands::select_project,
            commands::save_snapshot,
            commands::list_snapshots,
            commands::set_safety_state,
        ])
        .run(tauri::generate_context!())
        .expect("DroneLab failed to launch; native storage or desktop initialization failed");
}


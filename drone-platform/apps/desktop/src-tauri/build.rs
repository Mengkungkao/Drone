fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "get_workspace",
                "create_project",
                "select_project",
                "save_snapshot",
                "list_snapshots",
                "set_safety_state",
            ]),
        ),
    )
    .expect("DroneLab Tauri configuration could not be built");
}


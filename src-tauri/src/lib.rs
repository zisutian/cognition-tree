mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let file_store = storage::NoteFileStore::new(
                app_data_dir.join("repositories").join("local-workspace"),
            )?;

            app.manage(file_store);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::commands::load_note_workspace,
            storage::commands::save_note_workspace,
            storage::commands::clear_note_workspace,
            storage::commands::get_note_repository_info,
            storage::commands::set_note_repository_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

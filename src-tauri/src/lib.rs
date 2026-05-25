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
            storage::load_note_workspace,
            storage::save_note_workspace,
            storage::clear_note_workspace,
            storage::get_note_repository_info,
            storage::set_note_repository_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

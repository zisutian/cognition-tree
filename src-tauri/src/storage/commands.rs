use super::{
    models::{NoteWorkspace, RepositoryInfo},
    NoteFileStore,
};
use tauri::State;

#[tauri::command]
pub fn load_note_workspace(
    file_store: State<'_, NoteFileStore>,
) -> Result<Option<NoteWorkspace>, String> {
    file_store
        .load_workspace()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_note_workspace(
    file_store: State<'_, NoteFileStore>,
    workspace: NoteWorkspace,
) -> Result<(), String> {
    file_store
        .save_workspace(&workspace)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_note_workspace(file_store: State<'_, NoteFileStore>) -> Result<(), String> {
    file_store
        .clear_workspace()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_note_repository_info(
    file_store: State<'_, NoteFileStore>,
) -> Result<RepositoryInfo, String> {
    file_store
        .repository_path()
        .map(|path| RepositoryInfo { path })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_note_repository_path(
    file_store: State<'_, NoteFileStore>,
    path: String,
) -> Result<Option<NoteWorkspace>, String> {
    file_store
        .set_repository_path(path)
        .map_err(|error| error.to_string())
}

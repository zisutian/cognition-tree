use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use tauri::State;

const WORKSPACE_FILE_NAME: &str = "workspace.json";
const NOTES_DIR_NAME: &str = "notes";

type StorageResult<T> = Result<T, Box<dyn std::error::Error>>;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRecord {
    id: String,
    title: String,
    source: String,
    syntax_profile_id: String,
    syntax_version: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind")]
pub enum NoteTreeNode {
    #[serde(rename = "folder")]
    Folder {
        id: String,
        title: String,
        children: Vec<NoteTreeNode>,
    },
    #[serde(rename = "note")]
    Note {
        id: String,
        #[serde(rename = "noteId")]
        note_id: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteWorkspace {
    id: String,
    name: String,
    active_note_id: String,
    notes: Vec<NoteRecord>,
    tree: Vec<NoteTreeNode>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceManifest {
    id: String,
    name: String,
    active_note_id: String,
    notes: Vec<NoteManifestEntry>,
    tree: Vec<NoteTreeNode>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteManifestEntry {
    id: String,
    title: String,
    file_name: String,
    syntax_profile_id: String,
    syntax_version: i64,
    created_at: String,
    updated_at: String,
}

pub struct NoteFileStore {
    root_dir: Mutex<PathBuf>,
}

impl NoteFileStore {
    pub fn new(root_dir: impl AsRef<Path>) -> StorageResult<Self> {
        let root_dir = root_dir.as_ref().to_path_buf();
        fs::create_dir_all(root_dir.join(NOTES_DIR_NAME))?;

        Ok(Self {
            root_dir: Mutex::new(root_dir),
        })
    }

    pub fn load_workspace(&self) -> StorageResult<Option<NoteWorkspace>> {
        let root_dir = self.lock_root_dir()?;
        let manifest_path = root_dir.join(WORKSPACE_FILE_NAME);

        if !manifest_path.exists() {
            return Ok(None);
        }

        let manifest =
            serde_json::from_str::<WorkspaceManifest>(&fs::read_to_string(manifest_path)?)?;
        let notes_dir = root_dir.join(NOTES_DIR_NAME);
        let notes = manifest
            .notes
            .into_iter()
            .map(|note| {
                let source = fs::read_to_string(notes_dir.join(&note.file_name))?;

                Ok(NoteRecord {
                    id: note.id,
                    title: note.title,
                    source,
                    syntax_profile_id: note.syntax_profile_id,
                    syntax_version: note.syntax_version,
                    created_at: note.created_at,
                    updated_at: note.updated_at,
                })
            })
            .collect::<StorageResult<Vec<_>>>()?;

        Ok(Some(NoteWorkspace {
            id: manifest.id,
            name: manifest.name,
            active_note_id: manifest.active_note_id,
            notes,
            tree: manifest.tree,
        }))
    }

    pub fn save_workspace(&self, workspace: &NoteWorkspace) -> StorageResult<()> {
        let root_dir = self.lock_root_dir()?;
        let notes_dir = root_dir.join(NOTES_DIR_NAME);

        fs::create_dir_all(&notes_dir)?;

        let manifest = WorkspaceManifest {
            id: workspace.id.clone(),
            name: workspace.name.clone(),
            active_note_id: workspace.active_note_id.clone(),
            notes: workspace
                .notes
                .iter()
                .map(|note| {
                    let file_name = format!("{}.ctn", note.id);

                    NoteManifestEntry {
                        id: note.id.clone(),
                        title: note.title.clone(),
                        file_name,
                        syntax_profile_id: note.syntax_profile_id.clone(),
                        syntax_version: note.syntax_version,
                        created_at: note.created_at.clone(),
                        updated_at: note.updated_at.clone(),
                    }
                })
                .collect(),
            tree: workspace.tree.clone(),
        };

        for note in &workspace.notes {
            fs::write(notes_dir.join(format!("{}.ctn", note.id)), &note.source)?;
        }

        fs::write(
            root_dir.join(WORKSPACE_FILE_NAME),
            serde_json::to_string_pretty(&manifest)?,
        )?;

        Ok(())
    }

    pub fn clear_workspace(&self) -> StorageResult<()> {
        let root_dir = self.lock_root_dir()?;
        let manifest_path = root_dir.join(WORKSPACE_FILE_NAME);
        let notes_dir = root_dir.join(NOTES_DIR_NAME);

        if manifest_path.exists() {
            fs::remove_file(manifest_path)?;
        }

        if notes_dir.exists() {
            fs::remove_dir_all(&notes_dir)?;
        }

        fs::create_dir_all(notes_dir)?;

        Ok(())
    }

    fn lock_root_dir(&self) -> StorageResult<MutexGuard<'_, PathBuf>> {
        self.root_dir.lock().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::Other, "file store lock poisoned").into()
        })
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_test_dir() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("cognition-tree-file-store-{timestamp}"))
    }

    fn create_workspace() -> NoteWorkspace {
        NoteWorkspace {
            id: "local-workspace".to_string(),
            name: "本地笔记库".to_string(),
            active_note_id: "note-test".to_string(),
            notes: vec![NoteRecord {
                id: "note-test".to_string(),
                title: "测试笔记".to_string(),
                source: "测试笔记\n  : 文件保存".to_string(),
                syntax_profile_id: "ctn-default".to_string(),
                syntax_version: 1,
                created_at: "2026-05-25T00:00:00.000Z".to_string(),
                updated_at: "2026-05-25T00:00:00.000Z".to_string(),
            }],
            tree: vec![NoteTreeNode::Folder {
                id: "folder-inbox".to_string(),
                title: "未整理".to_string(),
                children: vec![NoteTreeNode::Note {
                    id: "tree-note-test".to_string(),
                    note_id: "note-test".to_string(),
                }],
            }],
        }
    }

    #[test]
    fn saves_notes_as_ctn_files_and_loads_manifest() {
        let root_dir = create_test_dir();
        let store = NoteFileStore::new(&root_dir).expect("file store should open");
        let workspace = create_workspace();

        store
            .save_workspace(&workspace)
            .expect("workspace should save");

        let note_path = root_dir.join(NOTES_DIR_NAME).join("note-test.ctn");
        let saved_source = fs::read_to_string(note_path).expect("note file should exist");
        let loaded_workspace = store
            .load_workspace()
            .expect("workspace should load")
            .expect("workspace should exist");

        assert_eq!(saved_source, "测试笔记\n  : 文件保存");
        assert_eq!(loaded_workspace.notes.len(), 1);
        assert_eq!(loaded_workspace.notes[0].source, workspace.notes[0].source);
        assert_eq!(loaded_workspace.tree.len(), 1);

        fs::remove_dir_all(root_dir).expect("test dir should be removed");
    }
}

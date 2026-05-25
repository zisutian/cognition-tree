use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use tauri::State;

const WORKSPACE_FILE_NAME: &str = "workspace.json";
const NOTES_DIR_NAME: &str = "notes";
const DEFAULT_SYNTAX_PROFILE_ID: &str = "ctn-default";

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
#[serde(rename_all = "camelCase")]
pub struct CtnMarkerRule {
    marker: String,
    #[serde(rename = "type")]
    block_type: String,
    label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CtnSyntaxProfile {
    id: String,
    name: String,
    version: i64,
    space_indent_unit: i64,
    marker_rules: Vec<CtnMarkerRule>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum NoteTreeNode {
    #[serde(rename = "folder")]
    Folder {
        id: String,
        title: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default_syntax_profile_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        default_syntax_version: Option<i64>,
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
    active_note_id: Option<String>,
    #[serde(default = "default_syntax_profile_id")]
    default_syntax_profile_id: String,
    #[serde(default = "default_syntax_profiles")]
    syntax_profiles: Vec<CtnSyntaxProfile>,
    notes: Vec<NoteRecord>,
    tree: Vec<NoteTreeNode>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    path: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceManifest {
    id: String,
    name: String,
    active_note_id: Option<String>,
    #[serde(default = "default_syntax_profile_id")]
    default_syntax_profile_id: String,
    #[serde(default = "default_syntax_profiles")]
    syntax_profiles: Vec<CtnSyntaxProfile>,
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

fn default_syntax_profile_id() -> String {
    DEFAULT_SYNTAX_PROFILE_ID.to_string()
}

fn default_syntax_profiles() -> Vec<CtnSyntaxProfile> {
    vec![CtnSyntaxProfile {
        id: DEFAULT_SYNTAX_PROFILE_ID.to_string(),
        name: "默认 CTN 语法".to_string(),
        version: 1,
        space_indent_unit: 2,
        marker_rules: vec![
            marker_rule("[理解]", "personal-understanding", "理解"),
            marker_rule("[条件]", "condition", "条件"),
            marker_rule("[证据]", "evidence", "证据"),
            marker_rule("[反例]", "counterexample", "反例"),
            marker_rule("[组分]", "component", "组分"),
            marker_rule("[分类]", "category", "分类"),
            marker_rule("[例子]", "example", "例子"),
            marker_rule("[注]", "note", "注释"),
            marker_rule("[?]", "question", "疑问"),
            marker_rule(":", "definition", "定义"),
            marker_rule("#", "concept", "主题"),
            marker_rule("=", "definition", "定义"),
            marker_rule("?", "question", "疑问"),
            marker_rule("-", "condition", "条件"),
            marker_rule("+", "action", "行动"),
        ],
    }]
}

fn marker_rule(marker: &str, block_type: &str, label: &str) -> CtnMarkerRule {
    CtnMarkerRule {
        marker: marker.to_string(),
        block_type: block_type.to_string(),
        label: label.to_string(),
    }
}

fn prune_missing_note_nodes(
    tree: Vec<NoteTreeNode>,
    note_ids: &HashSet<String>,
) -> Vec<NoteTreeNode> {
    tree.into_iter()
        .filter_map(|node| match node {
            NoteTreeNode::Folder {
                id,
                title,
                default_syntax_profile_id,
                default_syntax_version,
                children,
            } => Some(NoteTreeNode::Folder {
                id,
                title,
                default_syntax_profile_id,
                default_syntax_version,
                children: prune_missing_note_nodes(children, note_ids),
            }),
            NoteTreeNode::Note { id, note_id } => note_ids
                .contains(&note_id)
                .then_some(NoteTreeNode::Note { id, note_id }),
        })
        .collect()
}

fn remove_stale_note_files(
    notes_dir: &Path,
    expected_note_files: &HashSet<String>,
) -> StorageResult<()> {
    for entry in fs::read_dir(notes_dir)? {
        let path = entry?.path();
        let is_ctn_file = path.extension().and_then(|extension| extension.to_str()) == Some("ctn");

        if !is_ctn_file {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if !expected_note_files.contains(file_name) {
            fs::remove_file(path)?;
        }
    }

    Ok(())
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

        Self::load_workspace_from(&root_dir)
    }

    pub fn save_workspace(&self, workspace: &NoteWorkspace) -> StorageResult<()> {
        let root_dir = self.lock_root_dir()?;

        Self::save_workspace_to(&root_dir, workspace)
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

    pub fn repository_path(&self) -> StorageResult<String> {
        let root_dir = self.lock_root_dir()?;

        Ok(root_dir.to_string_lossy().into_owned())
    }

    pub fn set_repository_path(
        &self,
        repository_path: impl AsRef<Path>,
    ) -> StorageResult<Option<NoteWorkspace>> {
        let repository_path = repository_path.as_ref().to_path_buf();
        fs::create_dir_all(repository_path.join(NOTES_DIR_NAME))?;

        {
            let mut root_dir = self.lock_root_dir()?;
            *root_dir = repository_path;
        }

        self.load_workspace()
    }

    fn load_workspace_from(root_dir: &Path) -> StorageResult<Option<NoteWorkspace>> {
        let manifest_path = root_dir.join(WORKSPACE_FILE_NAME);

        if !manifest_path.exists() {
            return Ok(None);
        }

        let manifest =
            serde_json::from_str::<WorkspaceManifest>(&fs::read_to_string(manifest_path)?)?;
        let WorkspaceManifest {
            id,
            name,
            active_note_id,
            default_syntax_profile_id,
            syntax_profiles,
            notes: note_entries,
            tree,
        } = manifest;
        let notes_dir = root_dir.join(NOTES_DIR_NAME);
        let mut notes = Vec::new();

        for note in note_entries {
            let source = match fs::read_to_string(notes_dir.join(&note.file_name)) {
                Ok(source) => source,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(Box::new(error)),
            };

            notes.push(NoteRecord {
                id: note.id,
                title: note.title,
                source,
                syntax_profile_id: note.syntax_profile_id,
                syntax_version: note.syntax_version,
                created_at: note.created_at,
                updated_at: note.updated_at,
            });
        }

        let note_ids = notes
            .iter()
            .map(|note| note.id.clone())
            .collect::<HashSet<_>>();
        let active_note_id = active_note_id.filter(|note_id| note_ids.contains(note_id));
        let tree = prune_missing_note_nodes(tree, &note_ids);

        Ok(Some(NoteWorkspace {
            id,
            name,
            active_note_id,
            default_syntax_profile_id,
            syntax_profiles,
            notes,
            tree,
        }))
    }

    fn save_workspace_to(root_dir: &Path, workspace: &NoteWorkspace) -> StorageResult<()> {
        let notes_dir = root_dir.join(NOTES_DIR_NAME);

        fs::create_dir_all(&notes_dir)?;

        let mut expected_note_files = HashSet::new();
        let manifest = WorkspaceManifest {
            id: workspace.id.clone(),
            name: workspace.name.clone(),
            active_note_id: workspace.active_note_id.clone(),
            default_syntax_profile_id: workspace.default_syntax_profile_id.clone(),
            syntax_profiles: workspace.syntax_profiles.clone(),
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
            let file_name = format!("{}.ctn", note.id);

            expected_note_files.insert(file_name.clone());
            fs::write(notes_dir.join(file_name), &note.source)?;
        }

        remove_stale_note_files(&notes_dir, &expected_note_files)?;

        fs::write(
            root_dir.join(WORKSPACE_FILE_NAME),
            serde_json::to_string_pretty(&manifest)?,
        )?;

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
            active_note_id: Some("note-test".to_string()),
            default_syntax_profile_id: default_syntax_profile_id(),
            syntax_profiles: default_syntax_profiles(),
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
                default_syntax_profile_id: Some(default_syntax_profile_id()),
                default_syntax_version: Some(1),
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

    #[test]
    fn loads_empty_newly_created_notes() {
        let root_dir = create_test_dir();
        let store = NoteFileStore::new(&root_dir).expect("file store should open");
        let mut workspace = create_workspace();

        workspace.notes[0].title = "未命名笔记".to_string();
        workspace.notes[0].source = String::new();
        store
            .save_workspace(&workspace)
            .expect("empty note should save");

        let loaded_workspace = store
            .load_workspace()
            .expect("empty note should load")
            .expect("workspace should exist");

        assert_eq!(loaded_workspace.active_note_id, workspace.active_note_id);
        assert_eq!(loaded_workspace.notes.len(), 1);
        assert_eq!(loaded_workspace.notes[0].source, "");

        fs::remove_dir_all(root_dir).expect("test dir should be removed");
    }

    #[test]
    fn prunes_notes_missing_from_disk_when_loading() {
        let root_dir = create_test_dir();
        let store = NoteFileStore::new(&root_dir).expect("file store should open");
        let workspace = create_workspace();

        store
            .save_workspace(&workspace)
            .expect("workspace should save");
        fs::remove_file(root_dir.join(NOTES_DIR_NAME).join("note-test.ctn"))
            .expect("note file should be removed");

        let loaded_workspace = store
            .load_workspace()
            .expect("workspace should load after external deletion")
            .expect("workspace should exist");

        assert!(loaded_workspace.active_note_id.is_none());
        assert!(loaded_workspace.notes.is_empty());
        assert_eq!(
            loaded_workspace.tree,
            vec![NoteTreeNode::Folder {
                id: "folder-inbox".to_string(),
                title: "未整理".to_string(),
                default_syntax_profile_id: Some(default_syntax_profile_id()),
                default_syntax_version: Some(1),
                children: vec![],
            }]
        );

        fs::remove_dir_all(root_dir).expect("test dir should be removed");
    }

    #[test]
    fn removes_stale_note_files_when_saving() {
        let root_dir = create_test_dir();
        let store = NoteFileStore::new(&root_dir).expect("file store should open");
        let mut workspace = create_workspace();

        store
            .save_workspace(&workspace)
            .expect("workspace should save");

        workspace.active_note_id = None;
        workspace.notes.clear();
        workspace.tree = vec![NoteTreeNode::Folder {
            id: "folder-inbox".to_string(),
            title: "未整理".to_string(),
            default_syntax_profile_id: Some(default_syntax_profile_id()),
            default_syntax_version: Some(1),
            children: vec![],
        }];

        store
            .save_workspace(&workspace)
            .expect("empty workspace should save");

        assert!(!root_dir.join(NOTES_DIR_NAME).join("note-test.ctn").exists());

        fs::remove_dir_all(root_dir).expect("test dir should be removed");
    }

    #[test]
    fn switches_repository_folder() {
        let first_root_dir = create_test_dir();
        let second_root_dir = create_test_dir();
        let store = NoteFileStore::new(&first_root_dir).expect("file store should open");
        let workspace = create_workspace();

        store
            .save_workspace(&workspace)
            .expect("workspace should save");
        let switched_workspace = store
            .set_repository_path(&second_root_dir)
            .expect("repository path should switch");

        assert!(switched_workspace.is_none());
        assert_eq!(
            store
                .repository_path()
                .expect("repository path should exist"),
            second_root_dir.to_string_lossy()
        );
        assert!(second_root_dir.join(NOTES_DIR_NAME).exists());

        fs::remove_dir_all(first_root_dir).expect("first test dir should be removed");
        fs::remove_dir_all(second_root_dir).expect("second test dir should be removed");
    }
}

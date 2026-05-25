use super::{
    models::{
        default_syntax_profile_id, default_syntax_profiles, NoteRecord, NoteTreeNode, NoteWorkspace,
    },
    StorageResult,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

const WORKSPACE_FILE_NAME: &str = "workspace.json";
const NOTES_DIR_NAME: &str = "notes";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceManifest {
    id: String,
    name: String,
    active_note_id: Option<String>,
    #[serde(default = "default_syntax_profile_id")]
    default_syntax_profile_id: String,
    #[serde(default = "default_syntax_profiles")]
    syntax_profiles: Vec<super::models::CtnSyntaxProfile>,
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

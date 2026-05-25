use super::{
    models::{
        default_syntax_profile_id, default_syntax_profiles, NoteRecord, NoteTreeNode, NoteWorkspace,
    },
    NoteFileStore,
};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const NOTES_DIR_NAME: &str = "notes";

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

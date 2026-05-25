import { invoke } from "@tauri-apps/api/core";
import type { NoteWorkspace } from "../domain/notes";
import type { NoteRepository } from "./noteRepository";

export function createTauriNoteRepository(): NoteRepository {
  return {
    label: "文件库",
    loadWorkspace() {
      return invoke<NoteWorkspace | null>("load_note_workspace");
    },
    saveWorkspace(workspace) {
      return invoke("save_note_workspace", { workspace });
    },
    clearWorkspace() {
      return invoke("clear_note_workspace");
    },
  };
}

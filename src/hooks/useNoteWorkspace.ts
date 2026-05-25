import { useEffect, useMemo, useState } from "react";
import {
  appendNoteToWorkspaceTree,
  createInitialWorkspace,
  createNoteRecord,
  inferNoteTitle,
  type NoteId,
  type NoteRecord,
  type NoteWorkspace,
} from "../domain/notes";
import { createLocalStorageNoteRepository } from "../storage/noteRepository";

function createDraftNote() {
  const timestamp = new Date().toISOString();
  const id = `note-${Date.now()}`;

  return createNoteRecord(id, `新笔记\n  : `, timestamp);
}

export function useNoteWorkspace() {
  const repository = useMemo(() => createLocalStorageNoteRepository(), []);
  const [workspace, setWorkspace] = useState<NoteWorkspace>(() => {
    return repository.loadWorkspace() ?? createInitialWorkspace();
  });

  useEffect(() => {
    repository.saveWorkspace(workspace);
  }, [repository, workspace]);

  const activeNote =
    workspace.notes.find((note) => note.id === workspace.activeNoteId) ??
    workspace.notes[0];

  const selectNote = (noteId: NoteId) => {
    setWorkspace((current) => ({
      ...current,
      activeNoteId: noteId,
    }));
  };

  const createNote = () => {
    const note = createDraftNote();

    setWorkspace((current) => ({
      ...current,
      activeNoteId: note.id,
      notes: [...current.notes, note],
      tree: appendNoteToWorkspaceTree(current.tree, note.id),
    }));
  };

  const updateActiveNoteSource = (source: string) => {
    setWorkspace((current) => {
      const timestamp = new Date().toISOString();

      return {
        ...current,
        notes: current.notes.map((note): NoteRecord => {
          if (note.id !== current.activeNoteId) {
            return note;
          }

          return {
            ...note,
            source,
            title: inferNoteTitle(source),
            updatedAt: timestamp,
          };
        }),
      };
    });
  };

  return {
    activeNote,
    createNote,
    selectNote,
    updateActiveNoteSource,
    workspace,
  };
}

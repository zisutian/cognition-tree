import { useEffect, useMemo, useState } from "react";
import {
  appendNoteToWorkspaceTree,
  createInitialWorkspace,
  createNoteRecord,
  inferNoteTitle,
  removeNoteFromWorkspaceTree,
  resolveFolderSyntaxProfile,
  type NoteId,
  type NoteRecord,
  type NoteWorkspace,
} from "../domain/notes";
import { createTauriNoteRepository } from "../storage/tauriNoteRepository";

const inboxFolderId = "folder-inbox";

function createDraftNote(workspace: NoteWorkspace) {
  const timestamp = new Date().toISOString();
  const id = `note-${Date.now()}`;
  const syntaxProfile = resolveFolderSyntaxProfile(workspace, inboxFolderId);

  return createNoteRecord(id, "", timestamp, syntaxProfile);
}

export function useNoteWorkspace() {
  const repository = useMemo(() => createTauriNoteRepository(), []);
  const [workspace, setWorkspace] = useState<NoteWorkspace>(() => {
    return createInitialWorkspace();
  });
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [repositoryPath, setRepositoryPath] = useState("");

  useEffect(() => {
    let isActive = true;

    void Promise.all([
      repository.loadWorkspace(),
      repository.getRepositoryInfo(),
    ]).then(([storedWorkspace, repositoryInfo]) => {
      if (!isActive) {
        return;
      }

      setRepositoryPath(repositoryInfo.path);
      setWorkspace(storedWorkspace ?? createInitialWorkspace());
      setIsWorkspaceLoaded(true);
    });

    return () => {
      isActive = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!isWorkspaceLoaded) {
      return;
    }

    void repository.saveWorkspace(workspace);
  }, [isWorkspaceLoaded, repository, workspace]);

  const activeNote =
    workspace.notes.find((note) => note.id === workspace.activeNoteId) ?? null;

  const selectNote = (noteId: NoteId) => {
    setWorkspace((current) => ({
      ...current,
      activeNoteId: noteId,
    }));
  };

  const createNote = () => {
    setWorkspace((current) => {
      const note = createDraftNote(current);

      return {
        ...current,
        activeNoteId: note.id,
        notes: [...current.notes, note],
        tree: appendNoteToWorkspaceTree(current.tree, note.id),
      };
    });
  };

  const reloadWorkspace = async () => {
    setIsWorkspaceLoaded(false);

    const [storedWorkspace, repositoryInfo] = await Promise.all([
      repository.loadWorkspace(),
      repository.getRepositoryInfo(),
    ]);

    setRepositoryPath(repositoryInfo.path);
    setWorkspace(storedWorkspace ?? createInitialWorkspace());
    setIsWorkspaceLoaded(true);
  };

  const deleteNote = (noteId: NoteId) => {
    setWorkspace((current) => {
      const notes = current.notes.filter((note) => note.id !== noteId);

      return {
        ...current,
        activeNoteId:
          current.activeNoteId === noteId
            ? (notes[0]?.id ?? null)
            : current.activeNoteId,
        notes,
        tree: removeNoteFromWorkspaceTree(current.tree, noteId),
      };
    });
  };

  const changeRepositoryPath = async (path: string) => {
    const nextPath = path.trim();

    if (!nextPath || nextPath === repositoryPath) {
      return;
    }

    setIsWorkspaceLoaded(false);

    const storedWorkspace = await repository.setRepositoryPath(nextPath);
    const repositoryInfo = await repository.getRepositoryInfo();

    setRepositoryPath(repositoryInfo.path);
    setWorkspace(storedWorkspace ?? createInitialWorkspace());
    setIsWorkspaceLoaded(true);
  };

  const updateActiveNoteSource = (source: string) => {
    setWorkspace((current) => {
      if (!current.activeNoteId) {
        return current;
      }

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
    changeRepositoryPath,
    createNote,
    deleteNote,
    reloadWorkspace,
    repositoryPath,
    selectNote,
    storageLabel: repository.label,
    updateActiveNoteSource,
    workspace,
  };
}

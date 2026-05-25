import { useEffect, useMemo, useState } from "react";
import {
  appendNoteToWorkspaceTree,
  createInitialWorkspace,
  createNoteRecord,
  defaultFolderId,
  findFirstFolderId,
  findFolderIdContainingNote,
  findFolderNode,
  inferNoteTitle,
  removeNoteFromWorkspaceTree,
  resolveWorkspaceSyntaxProfile,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteWorkspace,
} from "../domain/notes";
import { createTauriNoteRepository } from "../storage/tauriNoteRepository";

function createDraftNote(workspace: NoteWorkspace) {
  const timestamp = new Date().toISOString();
  const id = `note-${Date.now()}`;
  const syntaxProfile = resolveWorkspaceSyntaxProfile(workspace);

  return createNoteRecord(id, "", timestamp, syntaxProfile);
}

function resolveExistingFolderId(
  workspace: NoteWorkspace,
  preferredFolderId: FolderId,
) {
  return (
    findFolderNode(workspace.tree, preferredFolderId)?.id ??
    findFirstFolderId(workspace.tree) ??
    defaultFolderId
  );
}

export function useNoteWorkspace() {
  const repository = useMemo(() => createTauriNoteRepository(), []);
  const [workspace, setWorkspace] = useState<NoteWorkspace>(() => {
    return createInitialWorkspace();
  });
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [repositoryPath, setRepositoryPath] = useState("");
  const [selectedFolderId, setSelectedFolderId] =
    useState<FolderId>(defaultFolderId);

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
      const nextWorkspace = storedWorkspace ?? createInitialWorkspace();

      setWorkspace(nextWorkspace);
      setSelectedFolderId(resolveExistingFolderId(nextWorkspace, defaultFolderId));
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
    const folderId = findFolderIdContainingNote(workspace.tree, noteId);

    if (folderId) {
      setSelectedFolderId(folderId);
    }

    setWorkspace((current) => ({
      ...current,
      activeNoteId: noteId,
    }));
  };

  const selectFolder = (folderId: FolderId) => {
    setSelectedFolderId(resolveExistingFolderId(workspace, folderId));
  };

  const createNote = () => {
    setWorkspace((current) => {
      const targetFolderId = resolveExistingFolderId(current, selectedFolderId);
      const note = createDraftNote(current);

      return {
        ...current,
        activeNoteId: note.id,
        notes: [...current.notes, note],
        tree: appendNoteToWorkspaceTree(current.tree, note.id, targetFolderId),
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
    const nextWorkspace = storedWorkspace ?? createInitialWorkspace();

    setWorkspace(nextWorkspace);
    setSelectedFolderId((currentFolderId) =>
      resolveExistingFolderId(nextWorkspace, currentFolderId),
    );
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
    const nextWorkspace = storedWorkspace ?? createInitialWorkspace();

    setWorkspace(nextWorkspace);
    setSelectedFolderId(resolveExistingFolderId(nextWorkspace, defaultFolderId));
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
    selectFolder,
    selectNote,
    selectedFolderId,
    storageLabel: repository.label,
    updateActiveNoteSource,
    workspace,
  };
}

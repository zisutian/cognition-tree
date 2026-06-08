import { useEffect, useMemo, useState } from "react";
import {
  createInitialWorkspace,
  createNoteRecord,
  createWorkspaceWithSyntaxProfiles,
  defaultFolderId,
  inferNoteTitle,
  resolveNoteSyntaxProfile,
  resolveWorkspaceSyntaxProfile,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteWorkspace,
} from "../domain/notes";
import {
  appendNoteToWorkspaceTree,
  appendFolderToWorkspaceTree,
  collectNoteIdsInFolder,
  countFolders,
  createFolderTreeNode,
  findFirstFolderId,
  findFolderIdContainingNote,
  findFolderNode,
  moveNoteInWorkspaceTree,
  removeFolderFromWorkspaceTree,
  removeNoteFromWorkspaceTree,
  renameFolderInWorkspaceTree,
} from "../domain/noteTree";
import {
  moveNoteBlock as moveNoteBlockText,
  type NoteBlockMigrationTargetPosition,
} from "../domain/noteBlockMigration";
import { createRuntimeNoteRepository } from "../storage/runtimeNoteRepository";
import type { SyntaxProfileFile } from "../storage/noteRepository";
import { defaultCtnSyntaxProfile } from "../syntax/defaultSyntaxProfile";
import { formatSyntaxProfileToml } from "../syntax/profileToml";
import { parseCtnDocument } from "../ctn/parseOutline";

export type MoveNoteBlockTargetPositionRequest =
  | {
      kind: "end";
    }
  | {
      kind: "after-block";
      lineNumber: number;
    };

export type MoveNoteBlockRequest = {
  sourceBlockLineNumber: number;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  targetPosition: MoveNoteBlockTargetPositionRequest;
};

export type MoveNoteBlockActionResult =
  | {
      message: string;
      status: "moved";
    }
  | {
      message: string;
      status: "failed";
    };

function createDraftNote(workspace: NoteWorkspace) {
  const timestamp = new Date().toISOString();
  const id = `note-${Date.now()}`;
  const syntaxProfileResolution = resolveWorkspaceSyntaxProfile(workspace);

  if (syntaxProfileResolution.status !== "resolved") {
    return null;
  }

  return createNoteRecord(id, "", timestamp, syntaxProfileResolution.profile);
}

function createLocalFolderId() {
  return `folder-${globalThis.crypto.randomUUID()}`;
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

function applySyntaxFilesToWorkspace(
  workspace: NoteWorkspace | null,
  syntaxFiles: SyntaxProfileFile[],
) {
  const syntaxProfiles = syntaxFiles.map((file) => file.profile);

  if (!workspace) {
    return createWorkspaceWithSyntaxProfiles(syntaxProfiles);
  }

  return {
    ...workspace,
    syntaxProfiles,
  };
}

function createSyntaxTemplateSource(fileName: string) {
  const id =
    fileName
      .replace(/\.toml$/i, "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-") || "ctn-custom";

  return formatSyntaxProfileToml({
    ...defaultCtnSyntaxProfile,
    id,
    name: id,
  });
}

function createMoveFailure(message: string): MoveNoteBlockActionResult {
  return {
    message,
    status: "failed",
  };
}

export function useNoteWorkspace() {
  const repository = useMemo(() => createRuntimeNoteRepository(), []);
  const [workspace, setWorkspace] = useState<NoteWorkspace>(() => {
    return createInitialWorkspace();
  });
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [workspaceErrorMessage, setWorkspaceErrorMessage] = useState("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [syntaxFiles, setSyntaxFiles] = useState<SyntaxProfileFile[]>([]);
  const [selectedFolderId, setSelectedFolderId] =
    useState<FolderId>(defaultFolderId);

  useEffect(() => {
    let isActive = true;

    void Promise.all([
      repository.loadWorkspace(),
      repository.getRepositoryInfo(),
      repository.listSyntaxFiles(),
    ])
      .then(([storedWorkspace, repositoryInfo, storedSyntaxFiles]) => {
        if (!isActive) {
          return;
        }

        setRepositoryPath(repositoryInfo.path);
        const nextWorkspace = applySyntaxFilesToWorkspace(
          storedWorkspace,
          storedSyntaxFiles,
        );

        setSyntaxFiles(storedSyntaxFiles);
        setWorkspace(nextWorkspace);
        setSelectedFolderId(resolveExistingFolderId(nextWorkspace, defaultFolderId));
        setWorkspaceErrorMessage("");
        setIsWorkspaceLoaded(true);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setWorkspaceErrorMessage(
          error instanceof Error ? error.message : "工作区加载失败。",
        );
        setIsWorkspaceLoaded(false);
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

      if (!note) {
        return current;
      }

      return {
        ...current,
        activeNoteId: note.id,
        notes: [...current.notes, note],
        tree: appendNoteToWorkspaceTree(current.tree, note.id, targetFolderId),
      };
    });
  };

  const createFolder = (parentFolderId: FolderId, title: string) => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    const folderId = createLocalFolderId();

    setWorkspace((current) => {
      const targetFolderId = resolveExistingFolderId(current, parentFolderId);

      return {
        ...current,
        tree: appendFolderToWorkspaceTree(
          current.tree,
          createFolderTreeNode(folderId, nextTitle),
          targetFolderId,
        ),
      };
    });
    setSelectedFolderId(folderId);
  };

  const renameFolder = (folderId: FolderId, title: string) => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    setWorkspace((current) => {
      if (!findFolderNode(current.tree, folderId)) {
        return current;
      }

      return {
        ...current,
        tree: renameFolderInWorkspaceTree(current.tree, folderId, nextTitle),
      };
    });
    setSelectedFolderId(folderId);
  };

  const reloadWorkspace = async () => {
    setIsWorkspaceLoaded(false);
    setWorkspaceErrorMessage("");

    try {
      const [storedWorkspace, repositoryInfo, storedSyntaxFiles] =
        await Promise.all([
          repository.loadWorkspace(),
          repository.getRepositoryInfo(),
          repository.listSyntaxFiles(),
        ]);

      setRepositoryPath(repositoryInfo.path);
      const nextWorkspace = applySyntaxFilesToWorkspace(
        storedWorkspace,
        storedSyntaxFiles,
      );

      setSyntaxFiles(storedSyntaxFiles);
      setWorkspace(nextWorkspace);
      setSelectedFolderId((currentFolderId) =>
        resolveExistingFolderId(nextWorkspace, currentFolderId),
      );
      setIsWorkspaceLoaded(true);
    } catch (error) {
      setWorkspaceErrorMessage(
        error instanceof Error ? error.message : "工作区加载失败。",
      );
    }
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

  const deleteFolder = (folderId: FolderId) => {
    if (folderId === defaultFolderId) {
      return;
    }

    setWorkspace((current) => {
      if (
        countFolders(current.tree) <= 1 ||
        !findFolderNode(current.tree, folderId)
      ) {
        return current;
      }

      const removedNoteIds = new Set(
        collectNoteIdsInFolder(current.tree, folderId),
      );
      const notes = current.notes.filter((note) => !removedNoteIds.has(note.id));

      return {
        ...current,
        activeNoteId:
          current.activeNoteId && removedNoteIds.has(current.activeNoteId)
            ? (notes[0]?.id ?? null)
            : current.activeNoteId,
        notes,
        tree: removeFolderFromWorkspaceTree(current.tree, folderId),
      };
    });
    setSelectedFolderId(defaultFolderId);
  };

  const moveNote = (noteId: NoteId, targetFolderId: FolderId) => {
    setWorkspace((current) => {
      if (!current.notes.some((note) => note.id === noteId)) {
        return current;
      }

      const nextTargetFolderId = resolveExistingFolderId(
        current,
        targetFolderId,
      );

      return {
        ...current,
        tree: moveNoteInWorkspaceTree(
          current.tree,
          noteId,
          nextTargetFolderId,
        ),
      };
    });
    setSelectedFolderId(targetFolderId);
  };

  const changeRepositoryPath = async (path: string) => {
    const nextPath = path.trim();

    if (
      !nextPath ||
      nextPath === repositoryPath ||
      !repository.setRepositoryPath
    ) {
      return;
    }

    setIsWorkspaceLoaded(false);

    const [storedWorkspace, repositoryInfo, storedSyntaxFiles] = await Promise.all([
      repository.setRepositoryPath(nextPath),
      repository.getRepositoryInfo(),
      repository.listSyntaxFiles(),
    ]);

    setRepositoryPath(repositoryInfo.path);
    const nextWorkspace = applySyntaxFilesToWorkspace(
      storedWorkspace,
      storedSyntaxFiles,
    );

    setSyntaxFiles(storedSyntaxFiles);
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

  const refreshSyntaxState = async () => {
    const [storedWorkspace, storedSyntaxFiles] = await Promise.all([
      repository.loadWorkspace(),
      repository.listSyntaxFiles(),
    ]);
    const nextWorkspace = applySyntaxFilesToWorkspace(
      storedWorkspace,
      storedSyntaxFiles,
    );

    setSyntaxFiles(storedSyntaxFiles);
    setWorkspace(nextWorkspace);
    setSelectedFolderId((currentFolderId) =>
      resolveExistingFolderId(nextWorkspace, currentFolderId),
    );
  };

  const createSyntaxFile = async (fileName: string) => {
    const nextFileName = fileName.trim();

    if (!nextFileName) {
      return;
    }

    await repository.saveSyntaxFile(
      nextFileName,
      createSyntaxTemplateSource(nextFileName),
    );
    await refreshSyntaxState();
  };

  const updateSyntaxFile = async (fileName: string, source: string) => {
    await repository.saveSyntaxFile(fileName, source);
    await refreshSyntaxState();
  };

  const deleteSyntaxFile = async (fileName: string) => {
    await repository.deleteSyntaxFile(fileName);
    await refreshSyntaxState();
  };

  const updateActiveNoteSyntaxProfile = (
    syntaxProfileId: string,
    syntaxVersion: number,
  ) => {
    setWorkspace((current) => {
      if (!current.activeNoteId) {
        return current;
      }

      const syntaxProfile = current.syntaxProfiles.find(
        (profile) =>
          profile.id === syntaxProfileId && profile.version === syntaxVersion,
      );

      if (!syntaxProfile) {
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
            syntaxProfileId: syntaxProfile.id,
            syntaxVersion: syntaxProfile.version,
            updatedAt: timestamp,
          };
        }),
      };
    });
  };

  const moveNoteBlock = (
    request: MoveNoteBlockRequest,
  ): MoveNoteBlockActionResult => {
    const sourceNote = workspace.notes.find(
      (note) => note.id === request.sourceNoteId,
    );
    const targetNote = workspace.notes.find(
      (note) => note.id === request.targetNoteId,
    );

    if (!sourceNote || !targetNote) {
      return createMoveFailure("源笔记或目标笔记不存在。");
    }

    if (sourceNote.id === targetNote.id) {
      return createMoveFailure("第一版不支持同一笔记内移动块。");
    }

    const sourceSyntaxResolution = resolveNoteSyntaxProfile(workspace, sourceNote);
    const targetSyntaxResolution = resolveNoteSyntaxProfile(workspace, targetNote);

    if (sourceSyntaxResolution.status !== "resolved") {
      return createMoveFailure(sourceSyntaxResolution.message);
    }

    if (targetSyntaxResolution.status !== "resolved") {
      return createMoveFailure(targetSyntaxResolution.message);
    }

    const sourceDocument = parseCtnDocument(sourceNote.source, {
      syntaxProfile: sourceSyntaxResolution.profile,
    });
    const targetDocument = parseCtnDocument(targetNote.source, {
      syntaxProfile: targetSyntaxResolution.profile,
    });
    const sourceBlock = sourceDocument.blocks.find(
      (block) => block.lineNumber === request.sourceBlockLineNumber,
    );

    if (!sourceBlock) {
      return createMoveFailure("源块不存在。");
    }

    let targetPosition: NoteBlockMigrationTargetPosition = { kind: "end" };

    if (request.targetPosition.kind === "after-block") {
      const targetLineNumber = request.targetPosition.lineNumber;
      const targetBlock = targetDocument.blocks.find(
        (block) => block.lineNumber === targetLineNumber,
      );

      if (!targetBlock) {
        return createMoveFailure("目标插入位置不存在。");
      }

      targetPosition = {
        block: targetBlock,
        kind: "after-block",
      };
    }

    const result = moveNoteBlockText({
      sourceBlock,
      sourceBlocks: sourceDocument.blocks,
      sourceSource: sourceNote.source,
      targetPosition,
      targetSource: targetNote.source,
      targetSyntaxProfile: targetSyntaxResolution.profile,
    });

    if (result.status !== "moved") {
      return createMoveFailure(result.message);
    }

    const timestamp = new Date().toISOString();

    setWorkspace((current) => ({
      ...current,
      activeNoteId: targetNote.id,
      notes: current.notes.map((note): NoteRecord => {
        if (note.id === sourceNote.id) {
          return {
            ...note,
            source: result.nextSourceSource,
            title: inferNoteTitle(result.nextSourceSource),
            updatedAt: timestamp,
          };
        }

        if (note.id === targetNote.id) {
          return {
            ...note,
            source: result.nextTargetSource,
            title: inferNoteTitle(result.nextTargetSource),
            updatedAt: timestamp,
          };
        }

        return note;
      }),
    }));

    setSelectedFolderId(
      findFolderIdContainingNote(workspace.tree, targetNote.id) ?? selectedFolderId,
    );

    return {
      message: "块迁移完成。",
      status: "moved",
    };
  };

  return {
    activeNote,
    changeRepositoryPath,
    canChangeRepositoryPath: Boolean(repository.canChangeRepositoryPath),
    createFolder,
    createNote,
    createSyntaxFile,
    deleteSyntaxFile,
    deleteFolder,
    deleteNote,
    moveNoteBlock,
    moveNote,
    reloadWorkspace,
    repositoryPath,
    renameFolder,
    selectFolder,
    selectNote,
    selectedFolderId,
    storageLabel: repository.label,
    syntaxFiles,
    updateActiveNoteSource,
    updateActiveNoteSyntaxProfile,
    updateSyntaxFile,
    workspace,
    workspaceErrorMessage,
  };
}

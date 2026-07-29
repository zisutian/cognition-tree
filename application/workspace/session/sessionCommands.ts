import type { WorkspaceStructureIndex } from "../../../core/workspace/indexes/workspaceStructureIndex";
import type {
  MoveWorkspaceStructureBlockBetweenNotesFailureReason,
  MoveWorkspaceStructureBlockWithinNoteFailureReason,
  WorkspaceStructureBlockMoveBetweenNotesRequest,
  WorkspaceStructureBlockMoveWithinNoteRequest,
  WorkspaceStructureBlockTargetPositionRequest,
} from "../../../core/workspace/commands/structureBlockCommands";
import type {
  FolderId,
  NoteId,
  WorkspaceData,
} from "../../../core/workspace/model/workspaceData";
import {
  defaultNoteTitle,
} from "../../../core/workspace/model/workspaceData";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types";
import type { CtnEditableSourceChange } from "../../../core/ctn/metadata/textEdits";
import type {
  WorkspaceParseIndex,
} from "../../../core/workspace/indexes/workspaceParseIndex";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../../core/ctn/analysis/sourceAnalysis";
import type {
  NoteTreeMoveRequest,
} from "../../../core/workspace/model/noteTree/types";
import {
  prepareWorkspaceMutation,
  type WorkspaceBlockTarget,
  type WorkspaceDomainCommand,
} from "../commands/workspaceDomainCommands";

type WorkspaceStructureBlockMoveIndex = WorkspaceParseIndex;
type MoveWorkspaceStructureBlockBetweenNotesCommandResult =
  | {
      status: "moved";
      targetNoteId: NoteId;
    }
  | {
      reason: MoveWorkspaceStructureBlockBetweenNotesFailureReason;
      status: "failed";
      targetNoteId?: never;
    };
type MoveWorkspaceStructureBlockWithinNoteCommandResult =
  | {
      noteId: NoteId;
      status: "moved";
    }
  | {
      noteId?: never;
      reason: MoveWorkspaceStructureBlockWithinNoteFailureReason;
      status: "failed";
    };

export type WorkspaceNoteSourceUpdateResult = {
  authoritativeSource: string;
  titleNormalized: boolean;
};

export type SessionCommands = {
  createFolder: (
    parentFolderId: FolderId | null,
    title: string,
  ) => FolderId;
  createNote: (
    parentFolderId: FolderId | null,
  ) => NoteId;
  deleteFolder: (folderId: FolderId) => void;
  deleteNote: (noteId: NoteId) => void;
  moveStructureBlockBetweenNotes: (
    index: WorkspaceStructureBlockMoveIndex,
    request: WorkspaceStructureBlockMoveBetweenNotesRequest,
  ) => MoveWorkspaceStructureBlockBetweenNotesCommandResult;
  moveStructureBlockWithinNote: (
    index: WorkspaceStructureBlockMoveIndex,
    request: WorkspaceStructureBlockMoveWithinNoteRequest,
  ) => MoveWorkspaceStructureBlockWithinNoteCommandResult;
  moveTreeNode: (request: NoteTreeMoveRequest) => void;
  renameFolder: (folderId: FolderId, title: string) => void;
  renameNote: (noteId: NoteId, title: string) => void;
  updateNoteSource: (
    noteId: NoteId,
    change: CtnEditableSourceChange,
  ) => WorkspaceNoteSourceUpdateResult;
};

export type SessionCommandDependencies = {
  createBlockId: () => string;
  createFolderId: () => FolderId;
  createNoteId: () => NoteId;
  createSyntaxFileId: () => string;
  now: () => string;
};

export function createSessionCommands({
  commitDataSnapshot,
  dependencies,
  getSyntax,
  getAnalysisIndex,
  getWorkspace,
}: {
  commitDataSnapshot: (
    workspaceData: WorkspaceData,
    analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>,
  ) => void;
  dependencies: SessionCommandDependencies;
  getSyntax: () => CtnCompiledSyntax | null;
  getAnalysisIndex: () => WorkspaceParseIndex | null;
  getWorkspace: () => WorkspaceStructureIndex;
}): SessionCommands {
  const execute = (command: WorkspaceDomainCommand) => {
    const structure = getWorkspace();
    const mutation = prepareWorkspaceMutation({
      command,
      context: {
        index: getAnalysisIndex(),
        structure,
        syntax: getSyntax(),
      },
      createBlockId: dependencies.createBlockId,
    });

    commitDataSnapshot(mutation.content, mutation.analysisOverrides);
    return mutation;
  };
  const resolveBlockTarget = (
    index: WorkspaceParseIndex,
    noteId: NoteId,
    request: WorkspaceStructureBlockTargetPositionRequest,
  ): WorkspaceBlockTarget | null => {
    if (request.kind === "end") return request;
    const target = index.getParsedNote(noteId)?.analysis.document.blocks.find(
      ({ lineNumber }) => lineNumber === request.lineNumber,
    );

    if (!target) return null;
    return {
      kind: request.kind === "inside-block"
        ? "inside"
        : request.kind === "sibling-above"
          ? "above"
          : "below",
      targetBlockId: target.id,
    };
  };

  return {
    createFolder(parentFolderId, title) {
      const folderId = dependencies.createFolderId();
      execute({
        folderId,
        kind: "create-folder",
        parentFolderId,
        timestamp: dependencies.now(),
        title,
      });
      return folderId;
    },
    createNote(parentFolderId) {
      const noteId = dependencies.createNoteId();
      execute({
        body: "",
        kind: "create-note",
        noteId,
        parentFolderId,
        timestamp: dependencies.now(),
        title: defaultNoteTitle,
      });
      return noteId;
    },
    deleteFolder(folderId) {
      execute({
        folderId,
        kind: "delete-folder",
        timestamp: dependencies.now(),
      });
    },
    deleteNote(noteId) {
      execute({
        kind: "delete-note",
        noteId,
        timestamp: dependencies.now(),
      });
    },
    moveStructureBlockBetweenNotes(index, request) {
      if (request.sourceNoteId === request.targetNoteId) {
        return { reason: "same-note-unsupported", status: "failed" };
      }
      const source = index.getParsedNote(request.sourceNoteId);
      const targetNote = index.getParsedNote(request.targetNoteId);

      if (!source || !targetNote) {
        return { reason: "parsed-note-missing", status: "failed" };
      }
      const sourceBlock = source.analysis.document.blocks.find(
        ({ lineNumber }) => lineNumber === request.sourceBlockLineNumber,
      );
      if (!sourceBlock) {
        return { reason: "source-block-missing", status: "failed" };
      }
      const target = resolveBlockTarget(
        index,
        request.targetNoteId,
        request.targetPosition,
      );

      if (!target) {
        return { reason: "target-position-missing", status: "failed" };
      }
      execute({
        kind: "move-block",
        sourceBlockId: sourceBlock.id,
        sourceNoteId: request.sourceNoteId,
        target,
        targetNoteId: request.targetNoteId,
        timestamp: dependencies.now(),
      });

      return {
        status: "moved",
        targetNoteId: request.targetNoteId,
      };
    },
    moveStructureBlockWithinNote(index, request) {
      const parsed = index.getParsedNote(request.noteId);

      if (!parsed) {
        return { reason: "parsed-note-missing", status: "failed" };
      }
      const sourceBlock = parsed.analysis.document.blocks.find(
        ({ lineNumber }) => lineNumber === request.sourceBlockLineNumber,
      );
      if (!sourceBlock) {
        return { reason: "source-block-missing", status: "failed" };
      }
      const target = resolveBlockTarget(
        index,
        request.noteId,
        request.targetPosition,
      );
      if (!target) {
        return { reason: "target-position-missing", status: "failed" };
      }
      if (
        target.kind !== "end" &&
        parsed.analysis.document.blocks.some((block) =>
          block.id === target.targetBlockId &&
          block.lineNumber >= sourceBlock.lineNumber &&
          block.lineNumber <= sourceBlock.subtreeEndLineNumber
        )
      ) {
        return { reason: "target-inside-source", status: "failed" };
      }
      execute({
        kind: "move-block",
        sourceBlockId: sourceBlock.id,
        sourceNoteId: request.noteId,
        target,
        targetNoteId: request.noteId,
        timestamp: dependencies.now(),
      });

      return {
        noteId: request.noteId,
        status: "moved",
      };
    },
    moveTreeNode(request) {
      execute({
        kind: "move-tree-node",
        request,
        timestamp: dependencies.now(),
      });
    },
    renameFolder(folderId, title) {
      execute({
        folderId,
        kind: "rename-folder",
        timestamp: dependencies.now(),
        title,
      });
    },
    renameNote(noteId, title) {
      execute({
        kind: "rename-note",
        noteId,
        timestamp: dependencies.now(),
        title,
      });
    },
    updateNoteSource(noteId, change) {
      const hasSyntax = getSyntax() !== null;
      const result = execute({
        change,
        kind: "replace-note-source",
        noteId,
        timestamp: dependencies.now(),
      });
      const canonicalSource = result.content.notes.find(
        ({ id }) => id === noteId,
      )?.source;

      if (canonicalSource === undefined) {
        throw new Error(`Workspace note does not exist: ${noteId}`);
      }

      const authoritativeSource = hasSyntax
        ? result.analysisOverrides?.get(noteId)?.editableProjection.source ??
          change.source
        : canonicalSource;

      return {
        authoritativeSource,
        titleNormalized:
          authoritativeSource.split("\n", 1)[0] !==
            change.source.split("\n", 1)[0],
      };
    },
  };
}

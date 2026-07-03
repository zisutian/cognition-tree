import {
  parseCtnDocument,
  type CtnBlock,
} from "../ctn-parser/parseOutline";
import {
  moveNoteBlock,
  type NoteBlockMigrationTargetPosition,
} from "../domain/noteBlockMigration";
import {
  inferNoteTitle,
  type NoteId,
  type NoteRecord,
  type NoteWorkspace,
} from "../domain/notes";
import type { CtnSyntaxProfile } from "../ctn-syntax/types";
import { resolveWorkspaceSyntaxProfile } from "./syntaxResolution";

export type WorkspaceBlockMigrationTargetPositionRequest =
  | {
      kind: "end";
    }
  | {
      kind: "inside-block";
      lineNumber: number;
    }
  | {
      kind: "sibling-above";
      lineNumber: number;
    }
  | {
      kind: "sibling-below";
      lineNumber: number;
    };

export type WorkspaceBlockMigrationRequest = {
  sourceBlockLineNumber: number;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  targetPosition: WorkspaceBlockMigrationTargetPositionRequest;
};

export type WorkspaceBlockMigrationPreviewRequest = {
  sourceBlockLineNumber: number | null;
  sourceNoteId: NoteId | null;
  targetNoteId: NoteId | null;
  targetPosition: WorkspaceBlockMigrationTargetPositionRequest;
};

export type WorkspaceBlockMigrationPreviewResult =
  | {
      details?: never;
      message: string;
      status: "ready";
    }
  | {
      details?: string[];
      message: string;
      status: "blocked" | "idle";
    };

export type MoveWorkspaceBlockResult =
  | {
      message: string;
      status: "moved";
      targetNoteId: NoteId;
      workspace: NoteWorkspace;
    }
  | {
      message: string;
      status: "failed";
    };

type ParsedMigrationNote = {
  blocks: CtnBlock[];
  note: NoteRecord;
};

function createFailure(message: string): MoveWorkspaceBlockResult {
  return {
    message,
    status: "failed",
  };
}

function findNote(workspace: NoteWorkspace, noteId: NoteId) {
  return workspace.notes.find((note) => note.id === noteId) ?? null;
}

function resolveMigrationNote(
  profile: CtnSyntaxProfile,
  note: NoteRecord,
): ParsedMigrationNote {
  return {
    blocks: parseCtnDocument(note.source, {
      syntaxProfile: profile,
    }).blocks,
    note,
  };
}

function resolveTargetPosition(
  targetBlocks: CtnBlock[],
  targetPositionRequest: WorkspaceBlockMigrationTargetPositionRequest,
): NoteBlockMigrationTargetPosition | MoveWorkspaceBlockResult {
  if (targetPositionRequest.kind === "end") {
    return { kind: "end" };
  }

  const targetBlock = targetBlocks.find(
    (block) => block.lineNumber === targetPositionRequest.lineNumber,
  );

  if (!targetBlock) {
    return createFailure("目标插入位置不存在。");
  }

  return {
    block: targetBlock,
    kind: targetPositionRequest.kind,
  };
}

function isTargetPosition(
  result: NoteBlockMigrationTargetPosition | MoveWorkspaceBlockResult,
): result is NoteBlockMigrationTargetPosition {
  return !("status" in result);
}

function resolveMigrationInput(
  workspace: NoteWorkspace,
  request: WorkspaceBlockMigrationRequest,
) {
  const sourceNote = findNote(workspace, request.sourceNoteId);
  const targetNote = findNote(workspace, request.targetNoteId);

  if (!sourceNote || !targetNote) {
    return createFailure("源笔记或目标笔记不存在。");
  }

  if (sourceNote.id === targetNote.id) {
    return createFailure("第一版不支持同一笔记内移动块。");
  }

  const syntaxResolution = resolveWorkspaceSyntaxProfile(workspace);

  if (syntaxResolution.status !== "resolved") {
    return createFailure(syntaxResolution.message);
  }

  const sourceParsed = resolveMigrationNote(syntaxResolution.profile, sourceNote);
  const targetParsed = resolveMigrationNote(syntaxResolution.profile, targetNote);

  const sourceBlock = sourceParsed.blocks.find(
    (block) => block.lineNumber === request.sourceBlockLineNumber,
  );

  if (!sourceBlock) {
    return createFailure("源块不存在。");
  }

  const targetPosition = resolveTargetPosition(
    targetParsed.blocks,
    request.targetPosition,
  );

  if (!isTargetPosition(targetPosition)) {
    return targetPosition;
  }

  return {
    sourceBlock,
    sourceParsed,
    targetParsed,
    targetPosition,
  };
}

function mapPreviewFailure(result: Extract<
  MoveWorkspaceBlockResult,
  { status: "failed" }
>): WorkspaceBlockMigrationPreviewResult {
  return {
    message: result.message,
    status: "blocked",
  };
}

export function previewWorkspaceBlockMigration(
  workspace: NoteWorkspace,
  request: WorkspaceBlockMigrationPreviewRequest,
): WorkspaceBlockMigrationPreviewResult {
  if (workspace.notes.length < 2) {
    return {
      message: "至少需要两篇笔记。",
      status: "blocked",
    };
  }

  if (!request.sourceNoteId || !request.targetNoteId) {
    return {
      message: "源笔记或目标笔记未选定。",
      status: "idle",
    };
  }

  if (request.sourceBlockLineNumber === null) {
    return {
      message: "源笔记没有可移动块。",
      status: "blocked",
    };
  }

  const result = moveWorkspaceBlock(workspace, {
    sourceBlockLineNumber: request.sourceBlockLineNumber,
    sourceNoteId: request.sourceNoteId,
    targetNoteId: request.targetNoteId,
    targetPosition: request.targetPosition,
  }, "");

  if (result.status === "moved") {
    return {
      message: "当前选择可迁移。",
      status: "ready",
    };
  }

  return mapPreviewFailure(result);
}

export function moveWorkspaceBlock(
  workspace: NoteWorkspace,
  request: WorkspaceBlockMigrationRequest,
  timestamp: string,
): MoveWorkspaceBlockResult {
  const migrationInput = resolveMigrationInput(workspace, request);

  if ("status" in migrationInput) {
    return migrationInput;
  }

  const result = moveNoteBlock({
    sourceBlock: migrationInput.sourceBlock,
    sourceSource: migrationInput.sourceParsed.note.source,
    targetPosition: migrationInput.targetPosition,
    targetSource: migrationInput.targetParsed.note.source,
  });

  const sourceNoteId = migrationInput.sourceParsed.note.id;
  const targetNoteId = migrationInput.targetParsed.note.id;

  return {
    message: "块迁移完成。",
    status: "moved",
    targetNoteId,
    workspace: {
      ...workspace,
      activeNoteId: targetNoteId,
      notes: workspace.notes.map((note): NoteRecord => {
        if (note.id === sourceNoteId) {
          return {
            ...note,
            source: result.nextSourceSource,
            title: inferNoteTitle(result.nextSourceSource),
            updatedAt: timestamp,
          };
        }

        if (note.id === targetNoteId) {
          return {
            ...note,
            source: result.nextTargetSource,
            title: inferNoteTitle(result.nextTargetSource),
            updatedAt: timestamp,
          };
        }

        return note;
      }),
    },
  };
}

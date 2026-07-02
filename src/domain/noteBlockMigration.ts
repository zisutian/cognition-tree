import {
  extractBlockText,
  getBlockLineRange,
  getDocumentAppendLineNumber,
  insertBlockTextBeforeLine,
  removeBlockText,
  rewriteBlockIndent,
} from "./noteBlockText";

export type NoteBlockMigrationBlock = {
  endLineNumber: number;
  level: number;
  lineNumber: number;
};

export type NoteBlockMigrationTargetPosition =
  | {
      kind: "end";
    }
  | {
      block: NoteBlockMigrationBlock;
      kind: "inside-block";
    }
  | {
      block: NoteBlockMigrationBlock;
      kind: "sibling-above";
    }
  | {
      block: NoteBlockMigrationBlock;
      kind: "sibling-below";
    };

export type MoveNoteBlockInput = {
  sourceBlock: NoteBlockMigrationBlock;
  sourceSource: string;
  targetPosition: NoteBlockMigrationTargetPosition;
  targetSource: string;
};

export type MoveNoteBlockResult = {
  nextSourceSource: string;
  nextTargetSource: string;
  status: "moved";
};

function getTargetLevel(targetPosition: NoteBlockMigrationTargetPosition) {
  switch (targetPosition.kind) {
    case "inside-block":
      return targetPosition.block.level + 1;
    case "sibling-above":
    case "sibling-below":
      return targetPosition.block.level;
    case "end":
      return 0;
  }
}

function getTargetInsertionLineNumber(
  targetSource: string,
  targetPosition: NoteBlockMigrationTargetPosition,
) {
  switch (targetPosition.kind) {
    case "inside-block":
    case "sibling-below":
      return targetPosition.block.endLineNumber + 1;
    case "sibling-above":
      return targetPosition.block.lineNumber;
    case "end":
      return getDocumentAppendLineNumber(targetSource);
  }
}

export function moveNoteBlock(input: MoveNoteBlockInput): MoveNoteBlockResult {
  const sourceRange = getBlockLineRange(input.sourceBlock);
  const extractedText = extractBlockText(input.sourceSource, sourceRange);
  const rewrittenText = rewriteBlockIndent(
    extractedText,
    input.sourceBlock.level,
    getTargetLevel(input.targetPosition),
  );
  const nextSourceSource = removeBlockText(input.sourceSource, sourceRange);
  const nextTargetSource = insertBlockTextBeforeLine(
    input.targetSource,
    rewrittenText,
    getTargetInsertionLineNumber(input.targetSource, input.targetPosition),
  );

  return {
    nextSourceSource,
    nextTargetSource,
    status: "moved",
  };
}

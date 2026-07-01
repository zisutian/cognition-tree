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
  marker: string | null;
};

export type NoteBlockMigrationSyntaxProfile = {
  markerRules: Array<{ marker: string }>;
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
  sourceBlocks: NoteBlockMigrationBlock[];
  sourceSource: string;
  targetPosition: NoteBlockMigrationTargetPosition;
  targetSource: string;
  targetSyntaxProfile: NoteBlockMigrationSyntaxProfile;
};

export type MoveNoteBlockResult =
  | {
      nextSourceSource: string;
      nextTargetSource: string;
      status: "moved";
    }
  | {
      message: string;
      missingMarkers: string[];
      status: "incompatible-target-syntax";
    };

function getSubtreeBlocks(
  sourceBlocks: NoteBlockMigrationBlock[],
  sourceBlock: NoteBlockMigrationBlock,
) {
  return sourceBlocks.filter(
    (block) =>
      block.lineNumber >= sourceBlock.lineNumber &&
      block.endLineNumber <= sourceBlock.endLineNumber,
  );
}

function collectUsedMarkers(blocks: NoteBlockMigrationBlock[]) {
  return [
    ...new Set(
      blocks
        .map((block) => block.marker)
        .filter((marker): marker is string => marker !== null),
    ),
  ];
}

function collectMissingMarkers(
  usedMarkers: string[],
  targetSyntaxProfile: NoteBlockMigrationSyntaxProfile,
) {
  const targetMarkers = new Set(
    targetSyntaxProfile.markerRules.map((rule) => rule.marker),
  );

  return usedMarkers.filter((marker) => !targetMarkers.has(marker));
}

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
  const sourceSubtreeBlocks = getSubtreeBlocks(
    input.sourceBlocks,
    input.sourceBlock,
  );
  const missingMarkers = collectMissingMarkers(
    collectUsedMarkers(sourceSubtreeBlocks),
    input.targetSyntaxProfile,
  );

  if (missingMarkers.length > 0) {
    return {
      message: `目标笔记语法不支持 marker: ${missingMarkers.join(", ")}。`,
      missingMarkers,
      status: "incompatible-target-syntax",
    };
  }

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

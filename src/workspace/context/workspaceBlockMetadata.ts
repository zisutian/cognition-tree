import {
  ctnBlockMetadataDirective,
  isCtnBlockId,
} from "../../ctn/metadata/blockMetadata";
import { initializeCtnSourceBlockMetadata } from "../../ctn/metadata/sourceMetadata";
import { parseCtnDocument } from "../../ctn/parser/parseCtnDocument";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import {
  inferNoteTitle,
  type WorkspaceData,
} from "../model/workspaceData";

export class WorkspaceBlockMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceBlockMetadataError";
  }
}

function hasCtnBlockMetadata(source: string) {
  return source
    .split("\n", 1)[0]
    .trimStart()
    .startsWith(ctnBlockMetadataDirective);
}

function createUniqueBlockId(
  createId: () => string,
  blockIds: Set<string>,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blockId = createId();

    if (!isCtnBlockId(blockId)) {
      throw new WorkspaceBlockMetadataError(
        `Invalid generated CTN block id: ${blockId}`,
      );
    }

    if (!blockIds.has(blockId)) {
      blockIds.add(blockId);
      return blockId;
    }
  }

  throw new WorkspaceBlockMetadataError(
    "Unable to generate a unique workspace CTN block id.",
  );
}

export function validateWorkspaceBlockMetadata(
  workspaceData: WorkspaceData,
  syntaxProfile: CtnSyntaxProfile,
) {
  const ownerByBlockId = new Map<string, string>();

  workspaceData.notes.forEach((note) => {
    const document = parseCtnDocument(note.source, syntaxProfile);

    document.blocks.forEach((block) => {
      const existingOwner = ownerByBlockId.get(block.id);

      if (existingOwner) {
        throw new WorkspaceBlockMetadataError(
          `Duplicate CTN block id ${block.id} in notes ${existingOwner} and ${note.id}.`,
        );
      }

      ownerByBlockId.set(block.id, note.id);
    });
  });
}

export function initializeWorkspaceBlockMetadata(
  workspaceData: WorkspaceData,
  syntaxProfile: CtnSyntaxProfile,
  {
    createId = () => globalThis.crypto.randomUUID(),
  }: {
    createId?: () => string;
  } = {},
) {
  const blockIds = new Set<string>();

  workspaceData.notes.forEach((note) => {
    if (!hasCtnBlockMetadata(note.source)) {
      return;
    }

    parseCtnDocument(note.source, syntaxProfile).blocks.forEach((block) => {
      if (blockIds.has(block.id)) {
        throw new WorkspaceBlockMetadataError(
          `Duplicate CTN block id ${block.id} before metadata initialization.`,
        );
      }
      blockIds.add(block.id);
    });
  });

  const notes = workspaceData.notes.map((note) => {
    const source = hasCtnBlockMetadata(note.source)
      ? note.source
      : initializeCtnSourceBlockMetadata(note.source, syntaxProfile, {
          createdAt: note.createdAt,
          createId: () => createUniqueBlockId(createId, blockIds),
          updatedAt: note.updatedAt,
        });

    return {
      ...note,
      source,
      title: inferNoteTitle(source),
    };
  });
  const result = { ...workspaceData, notes };

  validateWorkspaceBlockMetadata(result, syntaxProfile);
  return result;
}

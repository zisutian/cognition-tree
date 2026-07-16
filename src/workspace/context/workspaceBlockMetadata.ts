import {
  parseCtnCanonicalDocument,
  readCtnCanonicalTitleHeader,
} from "../../ctn/parser/parseCtnDocument";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import type { WorkspaceData } from "../model/workspaceData";

export class WorkspaceBlockMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceBlockMetadataError";
  }
}

export function validateWorkspaceBlockMetadata(
  workspaceData: WorkspaceData,
  syntaxProfile: CtnSyntaxProfile | null,
) {
  collectWorkspaceBlockIds(workspaceData, syntaxProfile);
}

export function collectWorkspaceBlockIds(
  workspaceData: WorkspaceData,
  syntaxProfile: CtnSyntaxProfile | null,
) {
  const ownerByBlockId = new Map<string, string>();

  for (const note of workspaceData.notes) {
    let ids: string[];

    try {
      ids = syntaxProfile
        ? parseCtnCanonicalDocument(note.source, syntaxProfile).blocks.map(
            (block) => block.id,
          )
        : [readCtnCanonicalTitleHeader(note.source).metadata.id];
    } catch (error) {
      throw new WorkspaceBlockMetadataError(
        `Invalid canonical CTN source in note ${note.id}: ${
          error instanceof Error ? error.message : "unknown metadata error"
        }`,
      );
    }

    for (const id of ids) {
      const existingOwner = ownerByBlockId.get(id);

      if (existingOwner !== undefined) {
        throw new WorkspaceBlockMetadataError(
          `Duplicate CTN block id ${id} in notes ${existingOwner} and ${note.id}.`,
        );
      }

      ownerByBlockId.set(id, note.id);
    }
  }

  return new Set(ownerByBlockId.keys());
}

import { createCtnBlockIdAllocator } from "../../../ctn/metadata/blockIdAllocator";
import { formatCtnBlockMetadataLine } from "../../../ctn/metadata/blockMetadata";
import { createCtnEditableSource } from "../../../ctn/metadata/editableSource";
import { recanonicalizeCtnSourceBlockMetadata } from "../../../ctn/metadata/reconcileSourceMetadata";
import { initializeCtnRawSourceBlockMetadata } from "../../../ctn/metadata/sourceMetadata";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";
import { readCtnCanonicalTitleHeader } from "../../../ctn/parser/parseCtnDocument";
import {
  replaceWorkspaceNoteSources,
  type WorkspaceData,
} from "../model/workspaceData";
import {
  collectWorkspaceBlockIds,
  validateWorkspaceBlockMetadata,
} from "./workspaceBlockMetadata";

export function reconcileWorkspaceSyntaxBlockMetadata(
  workspaceData: WorkspaceData,
  previousSyntaxProfile: CtnSyntaxProfile | null,
  nextSyntaxProfile: CtnSyntaxProfile | null,
  {
    createBlockId,
    timestamp,
  }: {
    createBlockId: () => string;
    timestamp: string;
  },
) {
  if (!nextSyntaxProfile) {
    if (!previousSyntaxProfile) {
      return workspaceData;
    }

    const result = replaceWorkspaceNoteSources(
      workspaceData,
      workspaceData.notes.map((note) => {
        const { metadata } = readCtnCanonicalTitleHeader(note.source);
        const editableSource = createCtnEditableSource(
          note.source,
          previousSyntaxProfile,
        ).source;

        return {
          noteId: note.id,
          source: `${formatCtnBlockMetadataLine(metadata)}\n${editableSource}`,
        };
      }),
    );

    validateWorkspaceBlockMetadata(result, null);
    return result;
  }

  const allocator = createCtnBlockIdAllocator(
    createBlockId,
    collectWorkspaceBlockIds(workspaceData, previousSyntaxProfile),
  );
  const result = replaceWorkspaceNoteSources(
    workspaceData,
    workspaceData.notes.map((note) => ({
      noteId: note.id,
      source: previousSyntaxProfile
        ? recanonicalizeCtnSourceBlockMetadata(
            note.source,
            previousSyntaxProfile,
            nextSyntaxProfile,
            {
              allocateId: allocator.allocate,
              timestamp,
            },
          )
        : initializeCtnRawSourceBlockMetadata(
            note.source,
            nextSyntaxProfile,
            {
              allocateId: allocator.allocate,
              timestamp,
            },
          ),
    })),
  );

  validateWorkspaceBlockMetadata(result, nextSyntaxProfile);
  return result;
}

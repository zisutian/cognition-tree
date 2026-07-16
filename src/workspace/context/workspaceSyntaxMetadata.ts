import { createCtnBlockIdAllocator } from "../../ctn/metadata/blockIdAllocator";
import { recanonicalizeCtnSourceBlockMetadata } from "../../ctn/metadata/reconcileSourceMetadata";
import { initializeCtnRawSourceBlockMetadata } from "../../ctn/metadata/sourceMetadata";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
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
  nextSyntaxProfile: CtnSyntaxProfile,
  {
    createBlockId,
    timestamp,
  }: {
    createBlockId: () => string;
    timestamp: string;
  },
) {
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

import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import { getSyntaxProfileShapeError } from "../../ctn/syntax/profileValidation";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../model/workspaceData";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../indexes/workspaceStructureIndex";

export type WorkspaceContext = {
  syntaxProfile: CtnSyntaxProfile;
  workspace: WorkspaceStructureIndex;
};

export function assertValidWorkspaceSyntaxProfile(profile: CtnSyntaxProfile) {
  const shapeError = getSyntaxProfileShapeError(profile);

  if (shapeError) {
    throw new Error(`Invalid workspace syntax profile: ${shapeError}`);
  }
}

export function createInitialWorkspaceContext(
  syntaxProfile: CtnSyntaxProfile,
): WorkspaceContext {
  return createWorkspaceContext(createInitialWorkspaceData(), syntaxProfile);
}

export function createWorkspaceContext(
  workspaceData: WorkspaceData,
  syntaxProfile: CtnSyntaxProfile,
): WorkspaceContext {
  return attachWorkspaceSyntaxProfile(
    createWorkspaceStructureIndex(workspaceData),
    syntaxProfile,
  );
}

export function attachWorkspaceSyntaxProfile(
  workspace: WorkspaceStructureIndex,
  syntaxProfile: CtnSyntaxProfile,
): WorkspaceContext {
  assertValidWorkspaceSyntaxProfile(syntaxProfile);

  return {
    syntaxProfile,
    workspace,
  };
}

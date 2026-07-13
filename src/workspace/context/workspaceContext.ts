import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import { validateSyntaxProfile } from "../../ctn/syntax/profileSchema";
import type { WorkspaceData } from "../model/workspaceData";
import {
  createWorkspaceStructureIndex,
  type WorkspaceStructureIndex,
} from "../indexes/workspaceStructureIndex";

export type WorkspaceContext = {
  syntaxProfile: CtnSyntaxProfile;
  workspace: WorkspaceStructureIndex;
};

export function assertValidWorkspaceSyntaxProfile(profile: CtnSyntaxProfile) {
  const [diagnostic] = validateSyntaxProfile(profile);

  if (diagnostic) {
    throw new Error(
      `Invalid workspace syntax profile at ${diagnostic.path}: ${diagnostic.message}`,
    );
  }
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

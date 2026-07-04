import type { CtnSyntaxProfile } from "../../ctn-syntax/types";
import { getSyntaxProfileShapeError } from "../../ctn-syntax/profileValidation";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../model/workspaceData";

export type WorkspaceRuntime = WorkspaceData & {
  syntaxProfile: CtnSyntaxProfile;
};

export function assertValidWorkspaceSyntaxProfile(profile: CtnSyntaxProfile) {
  const shapeError = getSyntaxProfileShapeError(profile);

  if (shapeError) {
    throw new Error(`Invalid workspace syntax profile: ${shapeError}`);
  }
}

export function createInitialWorkspaceRuntime(
  syntaxProfile: CtnSyntaxProfile,
): WorkspaceRuntime {
  assertValidWorkspaceSyntaxProfile(syntaxProfile);

  return {
    ...createInitialWorkspaceData(),
    syntaxProfile,
  };
}

export function attachWorkspaceSyntaxProfile(
  workspace: WorkspaceData,
  syntaxProfile: CtnSyntaxProfile,
): WorkspaceRuntime {
  assertValidWorkspaceSyntaxProfile(syntaxProfile);

  return {
    ...workspace,
    syntaxProfile,
  };
}

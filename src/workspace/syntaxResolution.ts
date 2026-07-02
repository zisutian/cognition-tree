import type { NoteWorkspace } from "../domain/notes";
import { getSyntaxProfileShapeError } from "../syntax/profileValidation";
import type { CtnSyntaxProfile } from "../syntax/types";

export type SyntaxProfileResolution =
  | {
      status: "resolved";
      profile: CtnSyntaxProfile;
    }
  | {
      status: "invalid-profile";
      message: string;
    };

function resolveProfileShape(profile: CtnSyntaxProfile): SyntaxProfileResolution {
  const shapeError = getSyntaxProfileShapeError(profile);

  if (shapeError) {
    return {
      message: shapeError,
      status: "invalid-profile",
    };
  }

  return { profile, status: "resolved" };
}

export function resolveWorkspaceSyntaxProfile(
  workspace: NoteWorkspace,
): SyntaxProfileResolution {
  return resolveProfileShape(workspace.syntaxProfile);
}

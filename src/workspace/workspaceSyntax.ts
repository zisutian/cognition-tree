import type { NoteRecord, NoteWorkspace } from "../domain/notes";
import { getSyntaxProfileShapeError } from "../syntax/profileValidation";
import type { CtnSyntaxProfile } from "../syntax/types";

export type WorkspaceSyntaxProfileResolution =
  | {
      status: "resolved";
      profile: CtnSyntaxProfile;
    }
  | {
      status: "missing-profile";
      message: string;
      syntaxProfileId: string;
      syntaxVersion?: number;
    }
  | {
      status: "invalid-profile";
      message: string;
      syntaxProfileId: string;
      syntaxVersion?: number;
    };

function resolveProfileShape(
  profile: CtnSyntaxProfile,
  syntaxProfileId: string,
  syntaxVersion?: number,
): WorkspaceSyntaxProfileResolution {
  const shapeError = getSyntaxProfileShapeError(profile);

  if (shapeError) {
    return {
      message: shapeError,
      status: "invalid-profile",
      syntaxProfileId,
      syntaxVersion,
    };
  }

  return { profile, status: "resolved" };
}

export function resolveNoteSyntaxProfile(
  workspace: NoteWorkspace,
  note: NoteRecord,
): WorkspaceSyntaxProfileResolution {
  const profile = workspace.syntaxProfiles.find(
    (candidate) =>
      candidate.id === note.syntaxProfileId &&
      candidate.version === note.syntaxVersion,
  );

  if (!profile) {
    return {
      message: `笔记引用的语法 ${note.syntaxProfileId}@${note.syntaxVersion} 不存在。`,
      status: "missing-profile",
      syntaxProfileId: note.syntaxProfileId,
      syntaxVersion: note.syntaxVersion,
    };
  }

  return resolveProfileShape(profile, note.syntaxProfileId, note.syntaxVersion);
}

export function resolveWorkspaceDefaultSyntaxProfile(
  workspace: NoteWorkspace,
): WorkspaceSyntaxProfileResolution {
  const profile = workspace.syntaxProfiles.find(
    (candidate) => candidate.id === workspace.defaultSyntaxProfileId,
  );

  if (!profile) {
    return {
      message: `仓库默认语法 ${workspace.defaultSyntaxProfileId} 不存在。`,
      status: "missing-profile",
      syntaxProfileId: workspace.defaultSyntaxProfileId,
    };
  }

  return resolveProfileShape(profile, workspace.defaultSyntaxProfileId);
}

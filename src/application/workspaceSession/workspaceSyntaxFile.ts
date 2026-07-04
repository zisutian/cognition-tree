import { defaultCtnSyntaxProfile } from "../../ctn/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import type { WorkspaceSyntaxSourceFile } from "../../storage/workspaceRepository";

export const workspaceSyntaxFileName = "workspace.toml";

export type WorkspaceSyntaxFile = WorkspaceSyntaxSourceFile & {
  profile: CtnSyntaxProfile;
};

export function createDefaultWorkspaceSyntaxSource() {
  return formatSyntaxProfileToml(defaultCtnSyntaxProfile);
}

export function createDefaultWorkspaceSyntaxFile(): WorkspaceSyntaxFile {
  return {
    fileName: workspaceSyntaxFileName,
    profile: defaultCtnSyntaxProfile,
    source: createDefaultWorkspaceSyntaxSource(),
  };
}

export function parseWorkspaceSyntaxSource(
  fileName: string,
  source: string,
): WorkspaceSyntaxFile {
  const result = parseSyntaxProfileToml(source);

  if (!result.profile) {
    const message = result.diagnostics
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");

    throw new Error(`Invalid workspace syntax source: ${message}`);
  }

  return {
    fileName,
    profile: result.profile,
    source,
  };
}

export function resolveWorkspaceSyntaxFile(
  syntaxSourceFile: WorkspaceSyntaxSourceFile | null,
): WorkspaceSyntaxFile | null {
  return syntaxSourceFile
    ? parseWorkspaceSyntaxSource(
        syntaxSourceFile.fileName,
        syntaxSourceFile.source,
      )
    : null;
}

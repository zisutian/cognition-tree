import { defaultCtnSyntaxProfile } from "../../ctn/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";

export const workspaceSyntaxFileName = "workspace.toml";

export type WorkspaceSyntaxSourceFile = {
  fileName: string;
  source: string;
};

export type SyntaxFile = WorkspaceSyntaxSourceFile & {
  profile: CtnSyntaxProfile;
};

export function createDefaultSyntaxSource() {
  return formatSyntaxProfileToml(defaultCtnSyntaxProfile);
}

export function createDefaultSyntaxFile(): SyntaxFile {
  return {
    fileName: workspaceSyntaxFileName,
    profile: defaultCtnSyntaxProfile,
    source: createDefaultSyntaxSource(),
  };
}

export function parseSyntaxSource(
  fileName: string,
  source: string,
): SyntaxFile {
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

export function resolveSyntaxFile(
  syntaxSourceFile: WorkspaceSyntaxSourceFile | null,
): SyntaxFile | null {
  return syntaxSourceFile
    ? parseSyntaxSource(
        syntaxSourceFile.fileName,
        syntaxSourceFile.source,
      )
    : null;
}

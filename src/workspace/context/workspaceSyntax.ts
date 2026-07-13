import { defaultCtnSyntaxProfile } from "../../ctn/syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../../ctn/syntax/profileToml";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";

export type WorkspaceSyntax = {
  profile: CtnSyntaxProfile;
  source: string;
};

export function createDefaultWorkspaceSyntaxSource() {
  return formatSyntaxProfileToml(defaultCtnSyntaxProfile);
}

export function createDefaultWorkspaceSyntax(): WorkspaceSyntax {
  return {
    profile: defaultCtnSyntaxProfile,
    source: createDefaultWorkspaceSyntaxSource(),
  };
}

export function parseWorkspaceSyntax(source: string): WorkspaceSyntax {
  const result = parseSyntaxProfileToml(source);

  if (!result.profile) {
    const message = result.diagnostics
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");

    throw new Error(`Invalid workspace syntax source: ${message}`);
  }

  return {
    profile: result.profile,
    source,
  };
}

export function resolveWorkspaceSyntax(source: string | null) {
  return source === null ? null : parseWorkspaceSyntax(source);
}

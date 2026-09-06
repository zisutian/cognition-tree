import {
  compileCtnSyntaxSource,
  defaultCtnSyntax,
  defaultCtnSyntaxSource,
} from "../../ctn/index.ts";

import type { CtnCompiledSyntax } from "../../ctn/index.ts";

export type WorkspaceSyntax = {
  source: string;
  syntax: CtnCompiledSyntax;
};

export function createInitialWorkspaceSyntaxSource() {
  return defaultCtnSyntaxSource;
}

export function createInitialWorkspaceSyntax(): WorkspaceSyntax {
  return {
    source: createInitialWorkspaceSyntaxSource(),
    syntax: defaultCtnSyntax,
  };
}

export function parseWorkspaceSyntax(source: string): WorkspaceSyntax {
  const result = compileCtnSyntaxSource(source, "workspace");

  if (!result.syntax) {
    const message = result.diagnostics
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");

    throw new Error(`Invalid workspace syntax source: ${message}`);
  }
  return { source, syntax: result.syntax };
}

export function resolveWorkspaceSyntax(source: string | null) {
  return source === null ? null : parseWorkspaceSyntax(source);
}

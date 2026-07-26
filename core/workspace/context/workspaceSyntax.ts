import {
  compileCtnSyntaxSource,
} from "../../ctn/syntax/compiler";
import {
  defaultCtnSyntax,
  defaultCtnSyntaxSource,
} from "../../ctn/syntax/defaultSyntax";
import type { CtnCompiledSyntax } from "../../ctn/syntax/types";

export type WorkspaceSyntax = {
  source: string;
  syntax: CtnCompiledSyntax;
};

export function createDefaultWorkspaceSyntaxSource() {
  return defaultCtnSyntaxSource;
}

export function createDefaultWorkspaceSyntax(): WorkspaceSyntax {
  return {
    source: createDefaultWorkspaceSyntaxSource(),
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

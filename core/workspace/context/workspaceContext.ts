import type { CtnCompiledSyntax } from "../../ctn/index.ts";
import type {
  WorkspaceStructureIndex,
} from "../indexes/workspaceStructureIndex.ts";

export type WorkspaceContext = {
  syntax: CtnCompiledSyntax;
  workspace: WorkspaceStructureIndex;
};

export function attachWorkspaceSyntax(
  workspace: WorkspaceStructureIndex,
  syntax: CtnCompiledSyntax,
): WorkspaceContext {
  return { syntax, workspace };
}

import type { CtnCompiledSyntax } from "../../ctn/syntax/types";
import type {
  WorkspaceStructureIndex,
} from "../indexes/workspaceStructureIndex";

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

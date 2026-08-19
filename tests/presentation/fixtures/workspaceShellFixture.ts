import type {
  WorkspaceShell,
} from "../../../presentation/workspace/runtime/useWorkspaceApplication";

export function createWorkspaceShell(
  overrides: Partial<WorkspaceShell> = {},
): WorkspaceShell {
  return {
    hasConfiguredSyntax: true,
    ...overrides,
  };
}

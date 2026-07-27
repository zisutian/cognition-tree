import type {
  WorkspaceShell,
} from "../../../presentation/activities/bindings/workspace/runtime/useWorkspaceApplication";

export function createWorkspaceShell(
  overrides: Partial<WorkspaceShell> = {},
): WorkspaceShell {
  return {
    hasConfiguredSyntax: true,
    ...overrides,
  };
}

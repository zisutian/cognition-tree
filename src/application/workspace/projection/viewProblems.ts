import type { WorkspaceRepositoryCatalogIssue } from "../../../storage/repository/workspaceRepositoryCatalog";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "./viewDiagnostics";
import {
  projectRepositoryIssueMessage,
  repositoryAdapterLabels,
} from "./viewRepositoryIssues";

export type UiWorkbenchRepositoryProblem = {
  code: WorkspaceRepositoryCatalogIssue["code"];
  id: string;
  locationLabel: string;
  message: string;
  severity: "error" | "warning";
  source: "repository";
  target: {
    issueId: string;
    kind: "repository-issue";
  };
};

export type UiWorkbenchProblem =
  | UiWorkbenchDiagnostic
  | UiWorkbenchRepositoryProblem;

export type UiWorkbenchProblems = {
  errorCount: number;
  problems: UiWorkbenchProblem[];
  status: UiWorkbenchDiagnostics["status"];
  warningCount: number;
};

function compareProblems(
  left: UiWorkbenchProblem,
  right: UiWorkbenchProblem,
) {
  if (left.severity !== right.severity) {
    return left.severity === "error" ? -1 : 1;
  }

  const locationOrder = left.locationLabel.localeCompare(
    right.locationLabel,
    "zh-CN",
    { numeric: true },
  );

  return locationOrder || left.id.localeCompare(right.id, "zh-CN", {
    numeric: true,
  });
}

export function projectUiRepositoryProblems(
  issues: WorkspaceRepositoryCatalogIssue[],
): UiWorkbenchRepositoryProblem[] {
  return issues.map((issue) => ({
    code: issue.code,
    id: `repository:${issue.id}`,
    locationLabel: `${repositoryAdapterLabels[issue.adapter]} · ${issue.id}`,
    message: projectRepositoryIssueMessage(issue),
    severity: issue.status === "fault" ? "error" : "warning",
    source: "repository",
    target: {
      issueId: issue.id,
      kind: "repository-issue",
    },
  }));
}

export function createUiWorkbenchProblems(
  diagnostics: UiWorkbenchDiagnostics,
  repositoryIssues: WorkspaceRepositoryCatalogIssue[] = [],
): UiWorkbenchProblems {
  const problems = [
    ...diagnostics.diagnostics,
    ...projectUiRepositoryProblems(repositoryIssues),
  ].sort(compareProblems);

  return {
    errorCount: problems.filter(({ severity }) => severity === "error").length,
    problems,
    status: diagnostics.status,
    warningCount: problems.filter(({ severity }) => severity === "warning").length,
  };
}

import type {
  JournalDiagnostic,
  JournalDiagnostics,
} from "../journal/journalDiagnostics";
import type {
  TodoDiagnostic,
  TodoDiagnostics,
} from "../todo/todoDiagnostics";
import type { SystemRepositoryRuntimeIssue } from "../repository/projectSystemRepositoryIssues";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "../workspace/projection/viewDiagnostics";
import {
  projectRepositoryIssueMessage,
  repositoryAdapterLabels,
} from "../workspace/projection/viewRepositoryIssues";
import type { SystemRepositoryIssue } from "../../storage/repository/systemRepository";
import type {
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../storage/repository/workspaceRepositoryCatalog";

export type UiWorkbenchRepositoryProblem = {
  code:
    | SystemRepositoryRuntimeIssue["code"]
    | WorkspaceRepositoryCatalogIssue["code"]
    | "repository-name-conflict";
  id: string;
  locationLabel: string;
  message: string;
  severity: "error" | "warning";
  source: "repository";
  target: {
    issueId: string;
    kind: "repository-issue";
  } | {
    kind: "repository-name-conflict";
    repositoryId: string;
  } | {
    kind: "system-repository-issue";
    purpose: SystemRepositoryIssue["id"];
  };
};

export type UiWorkbenchProblem =
  | UiWorkbenchDiagnostic
  | JournalDiagnostic
  | TodoDiagnostic
  | UiWorkbenchRepositoryProblem;

export type UiWorkbenchProblems = {
  errorCount: number;
  problems: UiWorkbenchProblem[];
  status:
    | UiWorkbenchDiagnostics["status"]
    | JournalDiagnostics["status"]
    | TodoDiagnostics["status"];
  warningCount: number;
};

export type WorkbenchDiagnostics = {
  diagnostics: Array<UiWorkbenchDiagnostic | JournalDiagnostic | TodoDiagnostic>;
  status: UiWorkbenchProblems["status"];
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

export function projectUiRepositoryNameConflictProblems(
  repositories: WorkspaceRepositoryDescriptor[],
): UiWorkbenchRepositoryProblem[] {
  return repositories.flatMap((repository) =>
    repository.labelIssue
      ? [{
          code: "repository-name-conflict" as const,
          id: `repository-label-${repository.labelIssue}:${repository.id}`,
          locationLabel:
            `${repositoryAdapterLabels[repository.adapter]} · ${repository.label}`,
          message: repository.labelIssue === "nonportable"
            ? "仓库名称包含不可移植字符，请重命名。"
            : repository.labelIssue === "reserved"
              ? "仓库名称由内置仓库保留，请重命名。"
              : "仓库名称与其他仓库冲突，请重命名。",
          severity: "error" as const,
          source: "repository" as const,
          target: {
            kind: "repository-name-conflict" as const,
            repositoryId: repository.id,
          },
        }]
      : []
  );
}

export function projectUiSystemRepositoryProblems(
  issues: SystemRepositoryRuntimeIssue[],
): UiWorkbenchRepositoryProblem[] {
  return issues.map((issue) => {
    const label = issue.id === "system-journal" ? "日记" : "代办";

    return {
      code: issue.code,
      id: `system-repository:${issue.id}`,
      locationLabel: `内置 · ${label}`,
      message: issue.message,
      severity: "error",
      source: "repository",
      target: {
        kind: "system-repository-issue",
        purpose: issue.id,
      },
    };
  });
}

export function createUiWorkbenchProblems(
  diagnostics: WorkbenchDiagnostics,
  repositoryIssues: WorkspaceRepositoryCatalogIssue[] = [],
  repositories: WorkspaceRepositoryDescriptor[] = [],
  systemIssues: SystemRepositoryRuntimeIssue[] = [],
): UiWorkbenchProblems {
  const problems: UiWorkbenchProblem[] = [
    ...diagnostics.diagnostics,
    ...projectUiRepositoryProblems(repositoryIssues),
    ...projectUiRepositoryNameConflictProblems(repositories),
    ...projectUiSystemRepositoryProblems(systemIssues),
  ].sort(compareProblems);

  return {
    errorCount: problems.filter(({ severity }) => severity === "error").length,
    problems,
    status: diagnostics.status,
    warningCount: problems.filter(({ severity }) => severity === "warning")
      .length,
  };
}

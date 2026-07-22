import type {
  JournalDiagnostic,
  JournalDiagnostics,
} from "../journal/journalDiagnostics";
import type {
  TodoDiagnostic,
  TodoDiagnostics,
} from "../todo/todoDiagnostics";
import type { BuiltInRuntimeIssue } from "../repository/projectBuiltInIssues";
import type { WorkspaceRepositoryRuntimeIssue } from "../repository/projectWorkspaceRepositoryIssues";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "../workspace/projection/viewDiagnostics";
import {
  projectRepositoryIssueMessage,
  repositoryAdapterLabels,
} from "../workspace/projection/viewRepositoryIssues";
import type { BuiltInId } from "../repository/builtInRepository";
import type {
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../repository/workspaceRepositoryCatalog";
import type { WorkbenchFeedbackError } from "../workbench/workbenchFeedbackController";

export type UiWorkbenchOperationalProblem = {
  code: "operation_failed";
  id: string;
  locationLabel: string;
  message: string;
  severity: "error";
  source: "operation";
  target: {
    feedbackId: string;
    kind: "operational-error";
    sourceScope: string;
  };
};

export type UiWorkbenchRepositoryProblem = {
  code:
    | BuiltInRuntimeIssue["code"]
    | WorkspaceRepositoryRuntimeIssue["code"]
    | WorkspaceRepositoryCatalogIssue["code"]
    | `repository-name-${NonNullable<WorkspaceRepositoryDescriptor["labelIssue"]>}`;
  id: string;
  locationLabel: string;
  message: string;
  severity: "error" | "warning";
  source: "repository";
  target: {
    issueId: string;
    kind: "repository-issue";
  } | {
    entity: "repository";
    kind: "portable-name";
    owner: "repository";
    repositoryId: string;
  } | {
    kind: "repository-catalog";
  } | {
    kind: "repository-runtime";
    repositoryId: string;
  } | {
    id: BuiltInId;
    kind: "built-in-issue";
  } | {
    kind: "built-in-catalog";
  };
};

export type UiWorkbenchProblem =
  | UiWorkbenchDiagnostic
  | JournalDiagnostic
  | TodoDiagnostic
  | UiWorkbenchRepositoryProblem
  | UiWorkbenchOperationalProblem;

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

export function projectUiRepositoryLabelProblems(
  repositories: WorkspaceRepositoryDescriptor[],
): UiWorkbenchRepositoryProblem[] {
  return repositories.flatMap((repository) =>
    repository.labelIssue
      ? [{
          code: `repository-name-${repository.labelIssue}` as const,
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
            entity: "repository" as const,
            kind: "portable-name" as const,
            owner: "repository" as const,
            repositoryId: repository.id,
          },
        }]
      : []
  );
}

export function projectUiBuiltInProblems(
  issues: BuiltInRuntimeIssue[],
): UiWorkbenchRepositoryProblem[] {
  return issues.map((issue) => {
    if (issue.kind === "catalog") {
      return {
        code: issue.code,
        id: "built-in:catalog",
        locationLabel: "内置数据 · 目录",
        message: issue.message,
        severity: "error" as const,
        source: "repository" as const,
        target: { kind: "built-in-catalog" as const },
      };
    }
    const label = issue.id === "journal" ? "日记" : "代办";

    return {
      code: issue.code,
      id: `built-in:${issue.id}`,
      locationLabel: `内置数据 · ${label}`,
      message: issue.message,
      severity: "error",
      source: "repository",
      target: {
        id: issue.id,
        kind: "built-in-issue",
      },
    };
  });
}

export function projectUiWorkspaceRepositoryRuntimeProblems(
  issues: WorkspaceRepositoryRuntimeIssue[],
): UiWorkbenchRepositoryProblem[] {
  return issues.map((issue) =>
    issue.kind === "catalog"
      ? {
          code: issue.code,
          id: "repository-runtime:catalog",
          locationLabel: "普通仓库 · 目录",
          message: issue.message,
          severity: "error",
          source: "repository",
          target: { kind: "repository-catalog" },
        }
      : {
          code: issue.code,
          id: `repository-runtime:${issue.repositoryId}`,
          locationLabel:
            `${repositoryAdapterLabels[issue.adapter]} · ${issue.repositoryLabel}`,
          message: issue.message,
          severity: "error",
          source: "repository",
          target: {
            kind: "repository-runtime",
            repositoryId: issue.repositoryId,
          },
        }
  );
}

export function projectUiOperationalProblems<Scope extends string>(
  errors: readonly WorkbenchFeedbackError<Scope>[],
  getScopeLabel: (scope: Scope) => string = (scope) => scope,
): UiWorkbenchOperationalProblem[] {
  return errors.map((error) => ({
    code: "operation_failed",
    id: `operation:${error.id}`,
    locationLabel: getScopeLabel(error.scope),
    message: error.message,
    severity: "error",
    source: "operation",
    target: {
      feedbackId: error.id,
      kind: "operational-error",
      sourceScope: error.scope,
    },
  }));
}

export function createUiWorkbenchProblems(
  diagnostics: WorkbenchDiagnostics,
  repositoryIssues: WorkspaceRepositoryCatalogIssue[] = [],
  repositories: WorkspaceRepositoryDescriptor[] = [],
  builtInIssues: BuiltInRuntimeIssue[] = [],
  repositoryRuntimeIssues: WorkspaceRepositoryRuntimeIssue[] = [],
  operationalProblems: UiWorkbenchOperationalProblem[] = [],
): UiWorkbenchProblems {
  const problems: UiWorkbenchProblem[] = [
    ...diagnostics.diagnostics,
    ...projectUiRepositoryProblems(repositoryIssues),
    ...projectUiRepositoryLabelProblems(repositories),
    ...projectUiWorkspaceRepositoryRuntimeProblems(repositoryRuntimeIssues),
    ...projectUiBuiltInProblems(builtInIssues),
    ...operationalProblems,
  ].sort(compareProblems);

  return {
    errorCount: problems.filter(({ severity }) => severity === "error").length,
    problems,
    status: diagnostics.status,
    warningCount: problems.filter(({ severity }) => severity === "warning")
      .length,
  };
}

import type {
  JournalDiagnostic,
  JournalDiagnostics,
} from "../../journal/journalDiagnostics";
import type {
  TodoDiagnostic,
  TodoDiagnostics,
} from "../../todo/todoDiagnostics";
import type { BuiltInRuntimeIssue } from "../../repository/projectBuiltInIssues";
import type { WorkspaceRepositoryRuntimeIssue } from "../../repository/projectWorkspaceRepositoryIssues";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "../../workspace/projection/viewDiagnostics";
import { projectRepositoryIssueMessage } from
  "../../repository/repositoryIssueProjection";
import type { BuiltInId } from "../../repository/builtInCatalog";
import type {
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../repository/workspaceRepositoryCatalog";
import type { OperationalProblem } from "../../problems/problemCenter";

export type WorkbenchAgentProblemInput = Readonly<{
  code: string;
  id: string;
  message: string;
  sessionId: string | null;
}>;

export type UiWorkbenchAgentProblem = {
  code: string;
  id: string;
  locationLabel: string;
  message: string;
  severity: "error";
  source: "agent";
  target: {
    kind: "agent-problem";
    sessionId: string | null;
  };
};

export type UiWorkbenchOperationalProblem = {
  code: string;
  details: OperationalProblem<string>["details"];
  firstOccurredAt: string;
  id: string;
  lastOccurredAt: string;
  locationLabel: string;
  message: string;
  occurrenceCount: number;
  path: string | null;
  requestId: string | null;
  retryable: boolean;
  severity: OperationalProblem<string>["severity"];
  source: OperationalProblem<string>["source"];
  target: {
    problemId: string;
    kind: "operational-error";
    sessionId: string | null;
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
  | UiWorkbenchAgentProblem
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
    locationLabel: `本地 · ${issue.id}`,
    message: projectRepositoryIssueMessage(issue),
    severity: "error",
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
          locationLabel: `本地 · ${repository.label}`,
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
          locationLabel: `本地 · ${issue.repositoryLabel}`,
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
  errors: readonly OperationalProblem<Scope>[],
  getScopeLabel: (scope: Scope) => string = (scope) => scope,
): UiWorkbenchOperationalProblem[] {
  return errors.map((error) => ({
    code: error.code,
    details: error.details,
    firstOccurredAt: error.firstOccurredAt,
    id: `operation:${error.id}`,
    lastOccurredAt: error.lastOccurredAt,
    locationLabel: getScopeLabel(error.target.scope),
    message: error.message,
    occurrenceCount: error.occurrenceCount,
    path: error.path,
    requestId: error.requestId,
    retryable: error.retryable,
    severity: error.severity,
    source: error.source,
    target: {
      problemId: error.id,
      kind: "operational-error",
      sessionId: error.target.sessionId,
      sourceScope: error.target.scope,
    },
  }));
}

export function projectUiAgentProblems(
  problems: readonly WorkbenchAgentProblemInput[],
): UiWorkbenchAgentProblem[] {
  return problems.map((problem) => ({
    code: problem.code,
    id: problem.id,
    locationLabel: problem.sessionId
      ? `会话 ${problem.sessionId.slice(0, 8)}`
      : "Agent",
    message: problem.message,
    severity: "error",
    source: "agent",
    target: { kind: "agent-problem", sessionId: problem.sessionId },
  }));
}

export function createUiWorkbenchProblems(
  diagnostics: WorkbenchDiagnostics,
  repositoryIssues: WorkspaceRepositoryCatalogIssue[] = [],
  repositories: WorkspaceRepositoryDescriptor[] = [],
  builtInIssues: BuiltInRuntimeIssue[] = [],
  repositoryRuntimeIssues: WorkspaceRepositoryRuntimeIssue[] = [],
  operationalProblems: UiWorkbenchOperationalProblem[] = [],
  agentProblems: UiWorkbenchAgentProblem[] = [],
): UiWorkbenchProblems {
  const problems: UiWorkbenchProblem[] = [
    ...diagnostics.diagnostics,
    ...projectUiRepositoryProblems(repositoryIssues),
    ...projectUiRepositoryLabelProblems(repositories),
    ...projectUiWorkspaceRepositoryRuntimeProblems(repositoryRuntimeIssues),
    ...projectUiBuiltInProblems(builtInIssues),
    ...operationalProblems,
    ...agentProblems,
  ].sort(compareProblems);

  return {
    errorCount: problems.filter(({ severity }) => severity === "error").length,
    problems,
    status: diagnostics.status,
    warningCount: problems.filter(({ severity }) => severity === "warning")
      .length,
  };
}

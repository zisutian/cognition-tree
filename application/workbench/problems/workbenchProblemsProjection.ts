// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalDiagnostics } from "../../journal/journalDiagnostics";
import {
  projectBuiltInCatalogFailure,
  projectBuiltInRuntimeIssues,
  type BuiltInRuntimeIssue,
} from "../../repository/projectBuiltInIssues";
import {
  projectWorkspaceRepositoryRuntimeIssues,
  type WorkspaceRepositoryRuntimeIssue,
} from "../../repository/projectWorkspaceRepositoryIssues";
import type { RepositoryApplication } from
  "../../repository/repositoryApplication";
import type {
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../repository/workspaceRepositoryCatalog";
import type { TodoDiagnostics } from "../../todo/todoDiagnostics";
import type { OperationalProblem } from "../../problems/problemCenter";
import type { UiWorkbenchDiagnostics } from
  "../../workspace/projection/viewDiagnostics";
import {
  createUiWorkbenchProblems,
  projectUiOperationalProblems,
  projectUiAgentProblems,
  type UiWorkbenchOperationalProblem,
  type UiWorkbenchProblems,
  type WorkbenchAgentProblemInput,
  type WorkbenchDiagnostics,
} from "./workbenchProblems";

export type WorkbenchProblemScope =
  | "agent"
  | "journal"
  | "notes"
  | "repository"
  | "search"
  | "settings"
  | "syntax"
  | "todo";

export type SyntaxProblemOwner = "journal" | "todo" | "workspace";

export function selectWorkbenchProblems({
  builtInIssues,
  diagnostics,
  journalDiagnostics,
  operationalProblems = [],
  repositories,
  repositoryIssues,
  repositoryRuntimeIssues = [],
  syntaxDiagnostics,
  todoDiagnostics,
  agentProblems = [],
}: {
  activeScope: WorkbenchProblemScope;
  builtInIssues: BuiltInRuntimeIssue[];
  diagnostics: UiWorkbenchDiagnostics;
  journalDiagnostics?: JournalDiagnostics;
  operationalProblems?: UiWorkbenchOperationalProblem[];
  repositories: WorkspaceRepositoryDescriptor[];
  repositoryIssues: WorkspaceRepositoryCatalogIssue[];
  repositoryRuntimeIssues?: WorkspaceRepositoryRuntimeIssue[];
  syntaxDiagnostics?: WorkbenchDiagnostics;
  syntaxOwner?: SyntaxProblemOwner;
  todoDiagnostics?: TodoDiagnostics;
  agentProblems?: ReturnType<typeof projectUiAgentProblems>;
}): UiWorkbenchProblems {
  const diagnosticGroups = [
    diagnostics,
    journalDiagnostics,
    todoDiagnostics,
    syntaxDiagnostics,
  ].filter((group): group is WorkbenchDiagnostics => Boolean(group));
  const diagnosticById = new Map(
    diagnosticGroups.flatMap(({ diagnostics: items }) => items)
      .map((diagnostic) => [diagnostic.id, diagnostic] as const),
  );
  const globalDiagnostics: WorkbenchDiagnostics = {
    diagnostics: [...diagnosticById.values()],
    status: diagnosticGroups.some(({ status }) => status === "collecting")
      ? "collecting"
      : "ready",
  };

  return createUiWorkbenchProblems(
    globalDiagnostics,
    repositoryIssues,
    repositories,
    builtInIssues,
    repositoryRuntimeIssues,
    operationalProblems,
    agentProblems,
  );
}

export function projectWorkbenchProblems({
  activeScope,
  diagnostics,
  feedbackErrors = [],
  getScopeLabel,
  journalDiagnostics,
  repository,
  syntaxDiagnostics,
  syntaxOwner = "workspace",
  todoDiagnostics,
  agentProblems = [],
}: {
  activeScope: WorkbenchProblemScope;
  diagnostics: UiWorkbenchDiagnostics;
  feedbackErrors?: readonly OperationalProblem<string>[];
  getScopeLabel?: (scope: string) => string;
  journalDiagnostics?: JournalDiagnostics;
  repository: RepositoryApplication;
  syntaxDiagnostics?: WorkbenchDiagnostics;
  syntaxOwner?: SyntaxProblemOwner;
  todoDiagnostics?: TodoDiagnostics;
  agentProblems?: readonly WorkbenchAgentProblemInput[];
}): UiWorkbenchProblems {
  const ordinaryCatalog = repository.catalogState.status === "ready"
    ? repository.catalogState
    : null;
  const builtInCatalog = repository.builtIns.catalog.state.status === "ready"
    ? repository.builtIns.catalog.state
    : null;
  const builtInIssues = builtInCatalog
    ? projectBuiltInRuntimeIssues({
        issues: builtInCatalog.issues,
        repositories: builtInCatalog.repositories,
        sessions: repository.builtIns.sessions,
      })
    : repository.builtIns.catalog.state.status === "failed"
      ? [projectBuiltInCatalogFailure(
          repository.builtIns.catalog.state.errorMessage,
        )]
      : [];

  return selectWorkbenchProblems({
    activeScope,
    builtInIssues,
    diagnostics,
    journalDiagnostics,
    operationalProblems: projectUiOperationalProblems(
      feedbackErrors,
      getScopeLabel,
    ),
    repositories: ordinaryCatalog?.repositories ?? [],
    repositoryIssues: ordinaryCatalog?.issues ?? [],
    repositoryRuntimeIssues:
      projectWorkspaceRepositoryRuntimeIssues(repository),
    syntaxDiagnostics,
    syntaxOwner,
    todoDiagnostics,
    agentProblems: projectUiAgentProblems(agentProblems),
  });
}

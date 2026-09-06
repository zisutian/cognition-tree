// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalDiagnostics } from "../../journal/index.ts";
import {
  projectBuiltInCatalogFailure,
  projectBuiltInRuntimeIssues,
  type BuiltInRuntimeIssue,
  projectWorkspaceRepositoryRuntimeIssues,
  type WorkspaceRepositoryRuntimeIssue,
} from "../../repository/index.ts";

import type {
  RepositoryApplication,
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../repository/index.ts";

import type { TodoDiagnostics } from "../../todo/index.ts";
import type { OperationalProblem } from "../../problems/index.ts";
import type { UiWorkbenchDiagnostics } from
  "../../workspace/index.ts";
import {
  createUiWorkbenchProblems,
  projectUiOperationalProblems,
  projectUiAgentProblems,
  type UiWorkbenchOperationalProblem,
  type UiWorkbenchProblems,
  type WorkbenchAgentProblemInput,
  type WorkbenchDiagnostics,
} from "./workbenchProblems.ts";

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
  builtInIssues: BuiltInRuntimeIssue[];
  diagnostics: UiWorkbenchDiagnostics;
  journalDiagnostics?: JournalDiagnostics;
  operationalProblems?: UiWorkbenchOperationalProblem[];
  repositories: WorkspaceRepositoryDescriptor[];
  repositoryIssues: WorkspaceRepositoryCatalogIssue[];
  repositoryRuntimeIssues?: WorkspaceRepositoryRuntimeIssue[];
  syntaxDiagnostics?: WorkbenchDiagnostics;
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
  diagnostics,
  feedbackErrors = [],
  getScopeLabel,
  journalDiagnostics,
  repository,
  syntaxDiagnostics,
  todoDiagnostics,
  agentProblems = [],
}: {
  diagnostics: UiWorkbenchDiagnostics;
  feedbackErrors?: readonly OperationalProblem<string>[];
  getScopeLabel?: (scope: string) => string;
  journalDiagnostics?: JournalDiagnostics;
  repository: RepositoryApplication;
  syntaxDiagnostics?: WorkbenchDiagnostics;
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
    todoDiagnostics,
    agentProblems: projectUiAgentProblems(agentProblems),
  });
}

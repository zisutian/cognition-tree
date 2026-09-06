// SPDX-License-Identifier: GPL-3.0-or-later

export {
  createRepositoryProjection,
} from "./repositoryApplicationProjection.ts";
export {
  createSyntaxActivityDiagnostics,
} from "./problems/syntaxActivityDiagnostics.ts";
export {
  createWorkbenchController,
} from "./workbenchController.ts";
export {
  projectJournalSearchDocuments,
  projectTodoSearchDocuments,
  projectWorkspaceSearchDocuments,
} from "./searchCorpus.ts";
export {
  projectWorkbenchProblems,
} from "./problems/workbenchProblemsProjection.ts";
export type {
  UiWorkbenchOperationalProblem,
  UiWorkbenchProblem,
  UiWorkbenchProblems,
  WorkbenchDiagnostics,
} from "./problems/workbenchProblems.ts";
export type {
  WorkbenchController,
  WorkbenchControllerSnapshot,
  WorkbenchSearchFacade,
} from "./workbenchController.ts";

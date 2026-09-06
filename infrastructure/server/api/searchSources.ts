// SPDX-License-Identifier: GPL-3.0-or-later

import type { SearchCatalogPort } from "../../../application/search/index.ts";
import { projectJournalSearchDocuments, projectTodoSearchDocuments, projectWorkspaceSearchDocuments } from "../../../application/workbench/index.ts";
import type {
  WorkspaceRepositoryCatalog,
  ApiBuiltInCatalog,
} from "../repository/index.ts";

import { createApiResourceVersion } from "./resources/index.ts";
import {
  RepositoryAdapterError,
  WorkspacePayloadValidationError,
} from "../repository/index.ts";

import { WireContractError } from "../../../contracts/common/index.ts";
import {
  CtnBlockMetadataSyntaxError,
  CtnDocumentMetadataError,
} from "../../../core/ctn/index.ts";

import { JournalContentValidationError } from "../../../core/journal/index.ts";
import { TodoContentValidationError } from "../../../core/todo/index.ts";
import {
  WorkspaceBlockMetadataError,
  WorkspaceNoteHeaderError,
} from "../../../core/workspace/index.ts";


function isInvalidServerSearchSource(error: unknown) {
  if (error instanceof RepositoryAdapterError) {
    return error.code === "repository_corrupt" ||
      error.code === "unsupported_repository_version" ||
      error.code === "invalid_request";
  }
  return error instanceof WireContractError ||
    error instanceof WorkspacePayloadValidationError ||
    error instanceof JournalContentValidationError ||
    error instanceof TodoContentValidationError ||
    error instanceof CtnDocumentMetadataError ||
    error instanceof CtnBlockMetadataSyntaxError ||
    error instanceof WorkspaceBlockMetadataError ||
    error instanceof WorkspaceNoteHeaderError;
}


export function createSearchCatalogPort({ builtInCatalog, catalog }: { builtInCatalog: ApiBuiltInCatalog; catalog: WorkspaceRepositoryCatalog }): SearchCatalogPort {
  return {
    isInvalidSource: isInvalidServerSearchSource,
    async listWorkspaces() {
      const value = await catalog.listRepositories();
      return { ids: value.repositories.map(({ id }) => id), issues: value.issues.map(({ id, code }) => ({ id, invalid: code === "repository_corrupt" || code === "unsupported_repository_version" })) };
    },
    async loadWorkspace(repositoryId) {
      const snapshot = await catalog.getStore(repositoryId).then((store) => store.loadSnapshot());
      return { revision: snapshot.revision, loadDocuments: async () => projectWorkspaceSearchDocuments({ createVersion: createApiResourceVersion, index: snapshot.projection.analysisIndex, repositoryId, workspace: snapshot.projection.workspace }) };
    },
    async loadJournal() {
      const snapshot = await builtInCatalog.getStore("journal").then((store) => store.loadSnapshot());
      return { revision: snapshot.revision, loadDocuments: async () => projectJournalSearchDocuments({ createVersion: createApiResourceVersion, index: snapshot.projection }) };
    },
    async loadTodo() {
      const snapshot = await builtInCatalog.getStore("todo").then((store) => store.loadSnapshot());
      return { revision: snapshot.revision, loadDocuments: async () => projectTodoSearchDocuments({ createVersion: createApiResourceVersion, index: snapshot.projection }) };
    },
  };
}

// SPDX-License-Identifier: GPL-3.0-or-later

import type { SearchCatalogPort } from "../../../application/search/scopedSearch.ts";
import { projectJournalSearchDocuments, projectTodoSearchDocuments, projectWorkspaceSearchDocuments } from "../../../application/workbench/searchCorpus.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import type { ApiBuiltInCatalog } from "../repository/built-ins/catalogPort.ts";
import { createApiResourceVersion } from "./resources/versions.ts";
import { RepositoryAdapterError } from "../repository/store.ts";
import { WorkspacePayloadValidationError } from "../repository/workspace/layout.ts";
import { WireContractError } from "../../../contracts/common/contractValue.ts";
import { CtnBlockMetadataSyntaxError } from "../../../core/ctn/metadata/blockMetadata.ts";
import { CtnDocumentMetadataError } from "../../../core/ctn/parser/parseCtnDocument.ts";
import { JournalContentValidationError } from "../../../core/journal/model/journalErrors.ts";
import { TodoContentValidationError } from "../../../core/todo/model/todoErrors.ts";
import { WorkspaceBlockMetadataError } from "../../../core/workspace/context/workspaceBlockMetadata.ts";
import { WorkspaceNoteHeaderError } from "../../../core/workspace/model/workspaceData.ts";

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

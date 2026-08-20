// SPDX-License-Identifier: GPL-3.0-or-later

import type { DomainChangeSetDto } from "../../../../contracts/common/domainChanges.ts";
import type {
  WorkspaceResourceVersionPolicy,
} from "../../../../application/workspace/commands/workspaceAgentCommandPreparation.ts";
import type {
  JournalDomainVersions,
} from "../../../../application/journal/journalDomainCommands.ts";
import type {
  TodoDomainVersions,
} from "../../../../application/todo/todoDomainCommands.ts";
import { apiNotFound } from "../http/errors.ts";
import {
  assertRepositoryAllowed,
  publishTrackedChanges,
  requireBuiltInCatalog,
  type ApiHandlerContext,
} from "../http/handlerContext.ts";
import {
  synchronizeApiJournal,
  synchronizeApiTodo,
  synchronizeApiWorkspace,
} from "./service.ts";

async function publishApiChanges(
  context: ApiHandlerContext,
  changes: DomainChangeSetDto,
) {
  publishTrackedChanges(context, changes);
}

async function handleWorkspaceSync(
  context: ApiHandlerContext,
  repositoryId: string,
  mode: "commit" | "load",
  versionPolicy: WorkspaceResourceVersionPolicy,
) {
  assertRepositoryAllowed(context.principal, repositoryId);
  const store = await context.catalog.getStore(repositoryId);
  return synchronizeApiWorkspace({
    mode,
    observeRevision: (revision) =>
      context.revisionTracker.observeWorkspace(repositoryId, revision),
    publish: (changes) => publishApiChanges(context, changes),
    readJsonBody: context.readJsonBody,
    repositoryId,
    runtime: context.runtime,
    store,
    versionPolicy,
  });
}

async function handleJournalSync(
  context: ApiHandlerContext,
  mode: "commit" | "load",
  versionPolicy: JournalDomainVersions,
) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("journal");

  return synchronizeApiJournal({
    mode,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("journal", revision),
    publish: (changes) => publishApiChanges(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
    versionPolicy,
  });
}

async function handleTodoSync(
  context: ApiHandlerContext,
  mode: "commit" | "load",
  versionPolicy: TodoDomainVersions,
) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("todo");

  return synchronizeApiTodo({
    mode,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("todo", revision),
    publish: (changes) => publishApiChanges(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
    versionPolicy,
  });
}

export function handleApiSync(
  context: ApiHandlerContext,
  versionPolicies: {
    journal: JournalDomainVersions;
    todo: TodoDomainVersions;
    workspace: WorkspaceResourceVersionPolicy;
  },
) {
  const operationId = context.operation.operationId;
  const mode = operationId.startsWith("get") ? "load" : "commit";

  if (
    operationId === "getWorkspaceSyncSnapshot" ||
    operationId === "putWorkspaceSyncSnapshot"
  ) {
    const repositoryId = context.route.repositoryId;

    if (!repositoryId) apiNotFound();
    return handleWorkspaceSync(
      context,
      repositoryId,
      mode,
      versionPolicies.workspace,
    );
  }
  return operationId === "getJournalSyncSnapshot" ||
      operationId === "putJournalSyncSnapshot"
    ? handleJournalSync(context, mode, versionPolicies.journal)
    : handleTodoSync(context, mode, versionPolicies.todo);
}

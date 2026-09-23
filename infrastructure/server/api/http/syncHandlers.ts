// SPDX-License-Identifier: GPL-3.0-or-later

import type {
JournalDomainVersions,
} from "../../../../application/journal/index.ts";
import type {
TodoDomainVersions,
} from "../../../../application/todo/index.ts";
import type {
WorkspaceResourceVersionPolicy,
} from "../../../../application/workspace/index.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/index.ts";
import { apiNotFound } from "../protocol/index.ts";
import {
synchronizeApiJournal,
synchronizeApiTodo,
synchronizeApiWorkspace,
} from "../sync/index.ts";
import {
changeCoordinator,
requireBuiltInCatalog,
type ApiHandlerContext,
} from "./handlerContext.ts";

async function publishApiChanges(
  context: ApiHandlerContext,
  changes: DomainChangeSetDto,
) {
  changeCoordinator(context).publish(changes);
}

async function handleWorkspaceSync(
  context: ApiHandlerContext,
  repositoryId: string,
  mode: "commit" | "load",
  versionPolicy: WorkspaceResourceVersionPolicy,
) {

  const store = await context.catalog.getStore(repositoryId);
  return synchronizeApiWorkspace({
    mode,
    observeRevision: (revision) =>
      changeCoordinator(context).recordWorkspace(repositoryId, revision),
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
      changeCoordinator(context).recordDomain("journal", revision),
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
      changeCoordinator(context).recordDomain("todo", revision),
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

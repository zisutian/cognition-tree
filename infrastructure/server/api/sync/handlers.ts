// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApiV1DomainChangeSetDto } from "../../../../contracts/api/types.ts";
import { apiV1NotFound } from "../http/errors.ts";
import {
  assertRepositoryAllowed,
  publishTrackedChanges,
  requireBuiltInCatalog,
  type ApiV1HandlerContext,
} from "../http/handlerContext.ts";
import {
  synchronizeApiV1Journal,
  synchronizeApiV1Todo,
  synchronizeApiV1Workspace,
} from "./service.ts";

async function publishApiV1Changes(
  context: ApiV1HandlerContext,
  changes: ApiV1DomainChangeSetDto,
) {
  publishTrackedChanges(context, changes);
}

async function handleWorkspaceSync(
  context: ApiV1HandlerContext,
  repositoryId: string,
) {
  assertRepositoryAllowed(context.principal, repositoryId);
  const store = await context.catalog.getStore(repositoryId);
  return synchronizeApiV1Workspace({
    method: context.method,
    observeRevision: (revision) =>
      context.revisionTracker.observeWorkspace(repositoryId, revision),
    publish: (changes) => publishApiV1Changes(context, changes),
    readJsonBody: context.readJsonBody,
    repositoryId,
    runtime: context.runtime,
    store,
  });
}

async function handleJournalSync(context: ApiV1HandlerContext) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("journal");

  return synchronizeApiV1Journal({
    method: context.method,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("journal", revision),
    publish: (changes) => publishApiV1Changes(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
  });
}

async function handleTodoSync(context: ApiV1HandlerContext) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("todo");

  return synchronizeApiV1Todo({
    method: context.method,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("todo", revision),
    publish: (changes) => publishApiV1Changes(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
  });
}

export function handleApiV1Sync(context: ApiV1HandlerContext) {
  if (context.route.kind === "sync-workspace") {
    const repositoryId = context.route.repositoryId;

    if (!repositoryId) apiV1NotFound();
    return handleWorkspaceSync(context, repositoryId);
  }
  return context.route.kind === "sync-journal"
    ? handleJournalSync(context)
    : handleTodoSync(context);
}

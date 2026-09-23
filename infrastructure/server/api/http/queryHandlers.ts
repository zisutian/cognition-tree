// SPDX-License-Identifier: GPL-3.0-or-later

import {
  readJournalEntriesResource,
  readJournalEntryResource,
  readTodoCollectionsResource,
  readTodoCollectionResource,
  readWorkspaceNoteResource,
  readWorkspaceTreeResource,
} from "../../../../application/content/index.ts";
import { apiNotFound } from "../protocol/index.ts";
import {
  journalResourceVersions,
  todoResourceVersions,
  workspaceResourceVersions,
} from "../resources/index.ts";
import {
observeBuiltInRevision,
observeWorkspaceRevision,
publishTrackedChanges,
requireBuiltInCatalog,
type ApiHandlerContext,
} from "./handlerContext.ts";


import { readApiRuntimeNow } from "./runtime.ts";

export async function handleWorkspaceQuery(context: ApiHandlerContext) {
  const { catalog, operation, route } = context;

  if (operation.operationId === "listWorkspaces") {
    const repositories = await catalog.listRepositories();
    const removed = context.revisionTracker.reconcileWorkspaceIds(
      new Set(repositories.repositories.map(({ id }) => id)),
    );

    if (removed.length > 0) {
      publishTrackedChanges(context, {
        blocks: [],
        occurredAt: readApiRuntimeNow(context.runtime).timestamp,
        resources: removed.map((repositoryId) => ({
          domain: "workspace",
          kind: "deleted",
          repositoryId,
          resourceId: repositoryId,
        })),
      });
    }
    return {
      body: {
        workspaces: repositories.repositories
          .map(({ id, label }) => ({ id, label })),
      },
      statusCode: 200,
    };
  }
  const repositoryId = route.repositoryId;

  if (!repositoryId) apiNotFound();

  const snapshot = await catalog.getStore(repositoryId)
    .then((store) => store.loadSnapshot());
  observeWorkspaceRevision(context, repositoryId, snapshot.revision);
  const preparation = snapshot.projection;

  if (operation.operationId === "getWorkspaceTree") {
    return {
      body: readWorkspaceTreeResource(
        repositoryId,
        snapshot.revision,
        snapshot.content,
        preparation,
        workspaceResourceVersions,
      ),
      statusCode: 200,
    };
  }
  const note = route.noteId
    ? readWorkspaceNoteResource(preparation, route.noteId, workspaceResourceVersions)
    : null;

  if (!note) apiNotFound("Workspace note does not exist");
  return { body: note, statusCode: 200 };
}

export async function handleJournalQuery(context: ApiHandlerContext) {
  const catalog = requireBuiltInCatalog(context.builtInCatalog);
  const snapshot = await catalog.getStore("journal").then((store) =>
    store.loadSnapshot()
  );
  observeBuiltInRevision(context, "journal", snapshot.revision);
  const content = snapshot.content;
  const index = snapshot.projection;

  if (context.operation.operationId === "listJournalEntries") {
    return {
      body: readJournalEntriesResource(content, index, snapshot.revision, journalResourceVersions),
      statusCode: 200,
    };
  }
  const entry = context.route.entryId
    ? readJournalEntryResource(index, context.route.entryId, journalResourceVersions)
    : null;

  if (!entry) apiNotFound("Journal entry does not exist");
  return { body: entry, statusCode: 200 };
}

export async function handleTodoQuery(context: ApiHandlerContext) {
  const catalog = requireBuiltInCatalog(context.builtInCatalog);
  const snapshot = await catalog.getStore("todo").then((store) =>
    store.loadSnapshot()
  );
  observeBuiltInRevision(context, "todo", snapshot.revision);
  const content = snapshot.content;
  const index = snapshot.projection;

  if (context.operation.operationId === "listTodoCollections") {
    return {
      body: readTodoCollectionsResource(content, index, snapshot.revision, todoResourceVersions),
      statusCode: 200,
    };
  }
  const { date } = readApiRuntimeNow(context.runtime);
  const collection = context.route.collectionId
    ? readTodoCollectionResource(index, context.route.collectionId, context.runtime.today(date), todoResourceVersions)
    : null;

  if (!collection) apiNotFound("Todo collection does not exist");

  return {
    body: collection,
    statusCode: 200,
  };
}

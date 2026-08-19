// SPDX-License-Identifier: GPL-3.0-or-later

import { isJournalEntryId } from "../../../../core/journal/model/journalIdentity.ts";
import { isTodoCollectionId } from "../../../../core/todo/model/todoIdentity.ts";
import { apiNotFound } from "./errors.ts";
import {
  assertRepositoryAllowed,
  observeBuiltInRevision,
  observeWorkspaceRevision,
  publishTrackedChanges,
  requireBuiltInCatalog,
  type ApiHandlerContext,
} from "./handlerContext.ts";
import {
  projectApiJournalEntries,
  projectApiJournalEntry,
} from "../resources/journal.ts";
import {
  projectApiTodoCollection,
  projectApiTodoCollections,
} from "../resources/todo.ts";
import {
  projectApiWorkspaceAnalysis,
  projectApiWorkspaceNote,
  projectApiWorkspaceTree,
} from "../resources/workspace.ts";
import { readApiRuntimeNow } from "./runtime.ts";

export async function handleWorkspaceQuery(context: ApiHandlerContext) {
  const { catalog, operation, principal, route } = context;

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
          .filter(({ id }) =>
            (principal.repositoryIds === null ||
              principal.repositoryIds.includes(id))
          )
          .map(({ adapter, id, label }) => ({ adapter, id, label })),
      },
      statusCode: 200,
    };
  }
  const repositoryId = route.repositoryId;

  if (!repositoryId) apiNotFound();
  assertRepositoryAllowed(principal, repositoryId);
  const snapshot = await catalog.getStore(repositoryId)
    .then((store) => store.loadSnapshot());
  observeWorkspaceRevision(context, repositoryId, snapshot.revision);
  const analysis = projectApiWorkspaceAnalysis(snapshot.projection);

  if (operation.operationId === "getWorkspaceTree") {
    return {
      body: projectApiWorkspaceTree(
        repositoryId,
        snapshot.revision,
        analysis,
      ),
      statusCode: 200,
    };
  }
  const note = route.noteId
    ? projectApiWorkspaceNote(analysis, route.noteId)
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
      body: projectApiJournalEntries(content, index, snapshot.revision),
      statusCode: 200,
    };
  }
  const entry = context.route.entryId
    && isJournalEntryId(context.route.entryId)
    ? index.getParsedEntry(context.route.entryId)
    : null;

  if (!entry) apiNotFound("Journal entry does not exist");
  return { body: projectApiJournalEntry(entry), statusCode: 200 };
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
      body: projectApiTodoCollections(content, index, snapshot.revision),
      statusCode: 200,
    };
  }
  const collection = context.route.collectionId
    && isTodoCollectionId(context.route.collectionId)
    ? index.getParsedCollection(context.route.collectionId)
    : null;

  if (!collection) apiNotFound("Todo collection does not exist");
  const { date } = readApiRuntimeNow(context.runtime);

  return {
    body: projectApiTodoCollection(
      collection,
      context.runtime.today(date),
    ),
    statusCode: 200,
  };
}

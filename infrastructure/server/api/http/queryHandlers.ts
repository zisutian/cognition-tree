// SPDX-License-Identifier: GPL-3.0-or-later

import { isJournalEntryId } from "../../../../core/journal/model/journalIdentity.ts";
import { isTodoCollectionId } from "../../../../core/todo/model/todoIdentity.ts";
import { apiV1NotFound } from "./errors.ts";
import {
  assertRepositoryAllowed,
  observeBuiltInRevision,
  observeWorkspaceRevision,
  publishTrackedChanges,
  requireBuiltInCatalog,
  type ApiV1HandlerContext,
} from "./handlerContext.ts";
import {
  projectApiV1JournalEntries,
  projectApiV1JournalEntry,
} from "../resources/journal.ts";
import {
  projectApiV1TodoCollection,
  projectApiV1TodoCollections,
} from "../resources/todo.ts";
import {
  projectApiV1WorkspaceAnalysis,
  projectApiV1WorkspaceNote,
  projectApiV1WorkspaceTree,
} from "../resources/workspace.ts";
import { readApiV1RuntimeNow } from "./runtime.ts";

export async function handleWorkspaceQuery(context: ApiV1HandlerContext) {
  const { catalog, principal, route } = context;

  if (route.kind === "workspaces") {
    const repositories = await catalog.listRepositories();
    const removed = context.revisionTracker.reconcileWorkspaceIds(
      new Set(repositories.repositories.map(({ id }) => id)),
    );

    if (removed.length > 0) {
      publishTrackedChanges(context, {
        blocks: [],
        occurredAt: readApiV1RuntimeNow(context.runtime).timestamp,
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

  if (!repositoryId) apiV1NotFound();
  assertRepositoryAllowed(principal, repositoryId);
  const snapshot = await catalog.getStore(repositoryId)
    .then((store) => store.loadSnapshot());
  observeWorkspaceRevision(context, repositoryId, snapshot.revision);
  const analysis = projectApiV1WorkspaceAnalysis(snapshot.projection);

  if (route.kind === "workspace-tree") {
    return {
      body: projectApiV1WorkspaceTree(
        repositoryId,
        snapshot.revision,
        analysis,
      ),
      statusCode: 200,
    };
  }
  const note = route.noteId
    ? projectApiV1WorkspaceNote(analysis, route.noteId)
    : null;

  if (!note) apiV1NotFound("Workspace note does not exist");
  return { body: note, statusCode: 200 };
}

export async function handleJournalQuery(context: ApiV1HandlerContext) {
  const catalog = requireBuiltInCatalog(context.builtInCatalog);
  const snapshot = await catalog.getStore("journal").then((store) =>
    store.loadSnapshot()
  );
  observeBuiltInRevision(context, "journal", snapshot.revision);
  const content = snapshot.content;
  const index = snapshot.projection;

  if (context.route.kind === "journal-entries") {
    return {
      body: projectApiV1JournalEntries(content, index, snapshot.revision),
      statusCode: 200,
    };
  }
  const entry = context.route.entryId
    && isJournalEntryId(context.route.entryId)
    ? index.getParsedEntry(context.route.entryId)
    : null;

  if (!entry) apiV1NotFound("Journal entry does not exist");
  return { body: projectApiV1JournalEntry(entry), statusCode: 200 };
}

export async function handleTodoQuery(context: ApiV1HandlerContext) {
  const catalog = requireBuiltInCatalog(context.builtInCatalog);
  const snapshot = await catalog.getStore("todo").then((store) =>
    store.loadSnapshot()
  );
  observeBuiltInRevision(context, "todo", snapshot.revision);
  const content = snapshot.content;
  const index = snapshot.projection;

  if (context.route.kind === "todo-collections") {
    return {
      body: projectApiV1TodoCollections(content, index, snapshot.revision),
      statusCode: 200,
    };
  }
  const collection = context.route.collectionId
    && isTodoCollectionId(context.route.collectionId)
    ? index.getParsedCollection(context.route.collectionId)
    : null;

  if (!collection) apiV1NotFound("Todo collection does not exist");
  const { date } = readApiV1RuntimeNow(context.runtime);

  return {
    body: projectApiV1TodoCollection(
      collection,
      context.runtime.today(date),
    ),
    statusCode: 200,
  };
}

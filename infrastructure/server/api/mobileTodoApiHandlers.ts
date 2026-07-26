// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseMobileTodoCompletionRequest,
} from "../../../contracts/mobile/parseMobile.ts";
import {
  cognitionMobileContractVersion,
  type MobileTodoCollectionDto,
  type MobileTodoCollectionsDto,
  type MobileTodoCollectionSummaryDto,
  type MobileTodoCompletionResultDto,
  type MobileTodoRecurrenceDto,
  type MobileTodoTaskDto,
} from "../../../contracts/mobile/types.ts";
import { parseTodoContent } from "../../../contracts/todo/parseTodo.ts";
import type {
  CtnCanonicalBlock,
} from "../../../core/ctn/parser/types.ts";
import {
  setTodoBlockCompletion,
  TodoOccurrenceConflictError,
} from "../../../core/todo/commands/todoCommands.ts";
import {
  createTodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import {
  isTodoCollectionId,
  todoItemSemanticType,
  type TodoCollection,
  type TodoContent,
} from "../../../core/todo/model/todoContent.ts";
import type {
  ParsedTodoIndexCollection,
  TodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import {
  projectTodoRecurrence,
  type TodoLocalDate,
} from "../../../core/todo/recurrence/todoRecurrence.ts";
import {
  VersionedContentRevisionConflictError,
} from "../repository/versionedContentStore.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import {
  MobileApiRequestError,
  type MobileApiRuntime,
  type MobileTodoApiRoute,
} from "./mobileApiCommon.ts";

function recurrenceProjection(
  collection: TodoCollection,
  blockId: string,
  today: TodoLocalDate,
): MobileTodoRecurrenceDto | null {
  const recurrence = collection.recurrences.find(
    (candidate) => candidate.blockId === blockId,
  );

  if (!recurrence) return null;
  const projection = projectTodoRecurrence(recurrence, today);

  return {
    active: projection.active,
    completedCount: projection.completedCount,
    currentOccurrenceDate: projection.currentOccurrenceDate,
    nextOccurrenceDate: projection.nextOccurrenceDate,
    rule: projection.currentStage?.rule ??
      recurrence.stages.at(-1)!.rule,
    totalCount: projection.totalCount,
  };
}

function projectTodoTasks(
  collection: TodoCollection,
  roots: CtnCanonicalBlock[],
  today: TodoLocalDate,
): MobileTodoTaskDto[] {
  const ordinaryCompletionById = new Map(
    collection.completions.map((completion) => [
      completion.blockId,
      completion.completedAt,
    ]),
  );
  const recurrenceById = new Map(
    collection.recurrences.map((recurrence) => [
      recurrence.blockId,
      projectTodoRecurrence(recurrence, today),
    ]),
  );
  const visit = (block: CtnCanonicalBlock): MobileTodoTaskDto[] => {
    const children = block.children.flatMap(visit);

    if (block.rule.semanticId !== todoItemSemanticType) return children;
    const projection = recurrenceById.get(block.id);
    const completedAt = projection?.active
      ? projection.completedAt
      : ordinaryCompletionById.get(block.id) ?? null;

    return [{
      children,
      completed: completedAt !== null,
      completedAt,
      id: block.id,
      label: block.rule.label,
      level: block.level,
      lineNumber: block.lineNumber,
      recurrence: recurrenceProjection(
        collection,
        block.id,
        today,
      ),
      text: block.text,
    }];
  };

  return roots.flatMap(visit);
}

function flattenMobileTasks(tasks: MobileTodoTaskDto[]) {
  const result: MobileTodoTaskDto[] = [];
  const pending = [...tasks].reverse();

  while (pending.length > 0) {
    const task = pending.pop();

    if (!task) continue;
    result.push(task);
    pending.push(...[...task.children].reverse());
  }
  return result;
}

function projectTodoCollection(
  index: TodoParseIndex,
  parsed: ParsedTodoIndexCollection,
  today: TodoLocalDate,
) {
  const roots = parsed.analysis.document.roots.filter(
    (block) => block.rule.semanticId !== index.syntax.title.semanticId,
  );
  const tasks = projectTodoTasks(parsed.collection, roots, today);
  const flat = flattenMobileTasks(tasks);
  const summary: MobileTodoCollectionSummaryDto = {
    completedTaskCount: flat.filter(({ completed }) => completed).length,
    id: parsed.collection.id,
    name: parsed.name,
    taskCount: flat.length,
  };

  return { summary, tasks };
}

async function loadTodo(catalog: BuiltInApiCatalog) {
  const snapshot = await catalog.getStore("todo").then((store) =>
    store.loadSnapshot()
  );
  const content = parseTodoContent(snapshot.content);
  const index = createTodoParseIndex(content);

  return { content, index, revision: snapshot.revision };
}

function requireTodoCollection(
  content: TodoContent,
  collectionId: string,
) {
  if (!isTodoCollectionId(collectionId)) {
    throw new MobileApiRequestError(
      "not_found",
      "Todo collection does not exist",
      { statusCode: 404 },
    );
  }
  const collection = content.collections.find(
    ({ id }) => id === collectionId,
  );

  if (!collection) {
    throw new MobileApiRequestError(
      "not_found",
      "Todo collection does not exist",
      { statusCode: 404 },
    );
  }
  return collection;
}

export async function handleMobileTodoApiRoute({
  catalog,
  readJsonBody,
  route,
  runtime,
}: {
  catalog: BuiltInApiCatalog;
  readJsonBody(): Promise<unknown>;
  route: MobileTodoApiRoute;
  runtime: MobileApiRuntime;
}): Promise<{
  body:
    | MobileTodoCollectionsDto
    | MobileTodoCollectionDto
    | MobileTodoCompletionResultDto;
  statusCode: number;
}> {
  const { content, index, revision } = await loadTodo(catalog);
  const today = runtime.today();

  if (route.kind === "mobile-todo-collections") {
    return {
      body: {
        collections: index.collections.map((parsed) =>
          projectTodoCollection(
            index,
            parsed,
            today,
          ).summary
        ),
        contractVersion: cognitionMobileContractVersion,
        revision,
      },
      statusCode: 200,
    };
  }
  const collection = requireTodoCollection(
    content,
    route.collectionId,
  );
  const projected = projectTodoCollection(
    index,
    index.getParsedCollection(collection.id)!,
    today,
  );

  if (route.kind === "mobile-todo-collection") {
    return {
      body: {
        collection: projected.summary,
        contractVersion: cognitionMobileContractVersion,
        revision,
        tasks: projected.tasks,
      },
      statusCode: 200,
    };
  }
  const request = parseMobileTodoCompletionRequest(
    await readJsonBody(),
  );

  if (request.expectedRevision !== revision) {
    throw new MobileApiRequestError(
      "revision_conflict",
      "Todo content changed outside the mobile request",
      { currentRevision: revision, statusCode: 409 },
    );
  }
  if (
    !flattenMobileTasks(projected.tasks)
      .some(({ id }) => id === route.blockId)
  ) {
    throw new MobileApiRequestError(
      "not_found",
      "Todo task does not exist",
      { statusCode: 404 },
    );
  }
  let next: TodoContent;

  try {
    next = setTodoBlockCompletion(
      content,
      index,
      {
      blockId: route.blockId,
      collectionId: collection.id,
      completed: request.completed,
      completedAt: runtime.now().toISOString(),
      occurrenceDate: request.occurrenceDate,
      today,
      },
    );
  } catch (error) {
    if (error instanceof TodoOccurrenceConflictError) {
      throw new MobileApiRequestError(
        "stale_occurrence",
        "Todo recurrence occurrence is no longer current",
        {
          currentOccurrenceDate: error.currentOccurrenceDate,
          currentRevision: revision,
          statusCode: 409,
        },
      );
    }
    throw error;
  }
  let committed;

  try {
    committed = await catalog.getStore("todo").then((store) =>
      store.commitSnapshot({
        baseRevision: request.expectedRevision,
        content: next,
      })
    );
  } catch (error) {
    if (error instanceof VersionedContentRevisionConflictError) {
      throw new MobileApiRequestError(
        "revision_conflict",
        "Todo content changed outside the mobile request",
        {
          currentRevision: error.currentRevision,
          statusCode: 409,
        },
      );
    }
    throw error;
  }
  const updatedCollection = requireTodoCollection(
    next,
    collection.id,
  );
  const updatedIndex = createTodoParseIndex(next, index);
  const updated = projectTodoCollection(
    updatedIndex,
    updatedIndex.getParsedCollection(updatedCollection.id)!,
    today,
  );
  const task = flattenMobileTasks(updated.tasks).find(
    ({ id }) => id === route.blockId,
  );

  if (!task) {
    throw new Error("Updated Todo task projection is missing");
  }
  return {
    body: {
      contractVersion: cognitionMobileContractVersion,
      revision: committed.revision,
      task,
    },
    statusCode: 200,
  };
}

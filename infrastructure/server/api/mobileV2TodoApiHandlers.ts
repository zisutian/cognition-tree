// SPDX-License-Identifier: GPL-3.0-or-later

import { parseMobileV2TodoCompletionRequest } from "../../../contracts/mobile/parseMobile.ts";
import {
  cognitionMobileV2ContractVersion,
  type MobileTodoCollectionSummaryDto,
  type MobileV2TodoCollectionDto,
  type MobileV2TodoCollectionsDto,
  type MobileV2TodoCompletionResultDto,
  type MobileV2TodoTaskDto,
} from "../../../contracts/mobile/types.ts";
import { parseTodoContent } from "../../../contracts/todo/parseTodo.ts";
import type { CtnCanonicalBlock } from "../../../core/ctn/parser/types.ts";
import {
  setTodoBlockCompletion,
  TodoOccurrenceConflictError,
} from "../../../core/todo/commands/todoCommands.ts";
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import {
  isTodoCollectionId,
  todoItemSemanticType,
  type TodoCollection,
  type TodoContent,
} from "../../../core/todo/model/todoContent.ts";
import type {
  TodoLocalDate,
} from "../../../core/todo/recurrence/todoRecurrence.ts";
import { VersionedContentRevisionConflictError } from "../repository/versionedContentStore.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import type { MobileApiRuntime } from "./mobileApiCommon.ts";
import {
  maximumMobileV2TreeDepth,
  MobileV2ApiRequestError,
  type MobileV2TodoApiRoute,
} from "./mobileV2ApiCommon.ts";
import {
  createMobileTodoTaskStateProjector,
} from "./mobileTodoProjection.ts";

function projectTodoTasks(
  collection: TodoCollection,
  roots: readonly CtnCanonicalBlock[],
  today: TodoLocalDate,
): MobileV2TodoTaskDto[] {
  const projectTaskState = createMobileTodoTaskStateProjector(
    collection,
    today,
  );
  const projected: MobileV2TodoTaskDto[] = [];
  const pending = [...roots]
    .reverse()
    .map((block) => ({ block, depth: 1, target: projected }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (current.depth > maximumMobileV2TreeDepth) {
      throw new MobileV2ApiRequestError(
        "projection_too_large",
        `Todo tree exceeds the mobile depth limit of ${maximumMobileV2TreeDepth}`,
        { statusCode: 422 },
      );
    }
    const state = projectTaskState(current.block.id);
    let childTarget = current.target;

    if (current.block.rule.semanticId === todoItemSemanticType) {
      const task: MobileV2TodoTaskDto = {
        children: [],
        completed: state.completedAt !== null,
        id: current.block.id,
        recurrence: state.recurrence,
        text: current.block.text,
      };

      current.target.push(task);
      childTarget = task.children;
    }
    for (let index = current.block.children.length - 1; index >= 0; index -= 1) {
      const child = current.block.children[index];

      if (child) {
        pending.push({
          block: child,
          depth: current.depth + 1,
          target: childTarget,
        });
      }
    }
  }
  return projected;
}

function flattenMobileTasks(tasks: readonly MobileV2TodoTaskDto[]) {
  const result: MobileV2TodoTaskDto[] = [];
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
    throw new MobileV2ApiRequestError(
      "not_found",
      "Todo collection does not exist",
      { statusCode: 404 },
    );
  }
  const collection = content.collections.find(
    ({ id }) => id === collectionId,
  );

  if (!collection) {
    throw new MobileV2ApiRequestError(
      "not_found",
      "Todo collection does not exist",
      { statusCode: 404 },
    );
  }
  return collection;
}

export async function handleMobileV2TodoApiRoute({
  catalog,
  readJsonBody,
  route,
  runtime,
}: {
  catalog: BuiltInApiCatalog;
  readJsonBody(): Promise<unknown>;
  route: MobileV2TodoApiRoute;
  runtime: MobileApiRuntime;
}): Promise<{
  body:
    | MobileV2TodoCollectionsDto
    | MobileV2TodoCollectionDto
    | MobileV2TodoCompletionResultDto;
  statusCode: number;
}> {
  const { content, index, revision } = await loadTodo(catalog);
  const today = runtime.today();

  if (route.kind === "mobile-v2-todo-collections") {
    return {
      body: {
        collections: index.collections.map((parsed) =>
          projectTodoCollection(
            index,
            parsed,
            today,
          ).summary
        ),
        contractVersion: cognitionMobileV2ContractVersion,
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

  if (route.kind === "mobile-v2-todo-collection") {
    return {
      body: {
        collection: projected.summary,
        contractVersion: cognitionMobileV2ContractVersion,
        revision,
        tasks: projected.tasks,
      },
      statusCode: 200,
    };
  }
  const request = parseMobileV2TodoCompletionRequest(
    await readJsonBody(),
  );

  if (request.expectedRevision !== revision) {
    throw new MobileV2ApiRequestError(
      "revision_conflict",
      "Todo content changed outside the mobile request",
      { currentRevision: revision, statusCode: 409 },
    );
  }
  if (
    !flattenMobileTasks(projected.tasks)
      .some(({ id }) => id === route.blockId)
  ) {
    throw new MobileV2ApiRequestError(
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
      throw new MobileV2ApiRequestError(
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
      throw new MobileV2ApiRequestError(
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
      collection: updated.summary,
      contractVersion: cognitionMobileV2ContractVersion,
      revision: committed.revision,
      task,
    },
    statusCode: 200,
  };
}

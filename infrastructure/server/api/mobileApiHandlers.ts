// SPDX-License-Identifier: GPL-3.0-or-later

import { parseMobileTodoCompletionRequest } from
  "../../../contracts/mobile/parseMobile.ts";
import {
  cognitionMobileContractVersion,
  type MobileApiErrorCodeDto,
  type MobileApiErrorDto,
  type MobileBuiltInStatusDto,
  type MobileCapabilityStatusDto,
  type MobileCtnBlockDto,
  type MobileJournalEntriesPageDto,
  type MobileJournalEntryDto,
  type MobileJournalEntrySummaryDto,
  type MobileTodoCollectionDto,
  type MobileTodoCollectionsDto,
  type MobileTodoCollectionSummaryDto,
  type MobileTodoCompletionResultDto,
  type MobileTodoRecurrenceDto,
  type MobileTodoTaskDto,
} from "../../../contracts/mobile/types.ts";
import { parseJournalContent } from "../../../contracts/journal/parseJournal.ts";
import { parseTodoContent } from "../../../contracts/todo/parseTodo.ts";
import {
  createJournalEntryBodyProjection,
  findJournalEntry,
  formatJournalEntryTitle,
  isJournalEntryId,
  validateJournalContent,
  type JournalEntry,
} from "../../../core/journal/model/journalContent.ts";
import {
  listJournalEntriesNewestFirst,
} from "../../../core/journal/queries/journalQueries.ts";
import {
  requireJournalSyntaxProfile,
} from "../../../core/journal/syntax/journalSyntax.ts";
import {
  setTodoBlockCompletion,
  TodoOccurrenceConflictError,
} from "../../../core/todo/commands/todoCommands.ts";
import {
  isTodoCollectionId,
  parseTodoCollection,
  todoItemSemanticType,
  validateTodoContent,
  type TodoCollection,
  type TodoContent,
} from "../../../core/todo/model/todoContent.ts";
import {
  projectTodoRecurrence,
  type TodoLocalDate,
} from "../../../core/todo/recurrence/todoRecurrence.ts";
import { requireTodoSyntaxProfile } from "../../../core/todo/syntax/todoSyntax.ts";
import type {
  CtnCanonicalBlock,
} from "../../../core/ctn/parser/types.ts";
import { VersionedContentRevisionConflictError } from
  "../repository/versionedContentStore.ts";
import { WorkspaceApiRequestError } from "./workspaceApiErrors.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import type { WorkspaceApiRoute } from "./workspaceApiRoutes.ts";

export type MobileApiRoute = Extract<
  WorkspaceApiRoute,
  {
    kind:
      | "mobile-status"
      | "mobile-journal-entries"
      | "mobile-journal-entry"
      | "mobile-todo-collections"
      | "mobile-todo-collection"
      | "mobile-todo-completion";
  }
>;

export type MobileApiRuntime = {
  now(): Date;
  today(): TodoLocalDate;
};

export class MobileApiRequestError extends Error {
  readonly code: MobileApiErrorCodeDto;
  readonly currentOccurrenceDate?: TodoLocalDate | null;
  readonly currentRevision?: `sha256:${string}`;
  readonly statusCode: number;

  constructor(
    code: MobileApiErrorCodeDto,
    message: string,
    {
      currentOccurrenceDate,
      currentRevision,
      statusCode,
    }: {
      currentOccurrenceDate?: TodoLocalDate | null;
      currentRevision?: `sha256:${string}`;
      statusCode: number;
    },
  ) {
    super(message);
    this.name = "MobileApiRequestError";
    this.code = code;
    this.currentOccurrenceDate = currentOccurrenceDate;
    this.currentRevision = currentRevision;
    this.statusCode = statusCode;
  }

  toDto(requestId: string): MobileApiErrorDto {
    return {
      code: this.code,
      contractVersion: cognitionMobileContractVersion,
      ...(this.currentOccurrenceDate !== undefined
        ? { currentOccurrenceDate: this.currentOccurrenceDate }
        : {}),
      ...(this.currentRevision
        ? { currentRevision: this.currentRevision }
        : {}),
      message: this.message,
      requestId,
    };
  }
}

export function isMobileApiRoute(
  route: WorkspaceApiRoute,
): route is MobileApiRoute {
  return route.kind.startsWith("mobile-");
}

function serverLocalDate(date = new Date()): TodoLocalDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as TodoLocalDate;
}

export const serverMobileApiRuntime: MobileApiRuntime = {
  now: () => new Date(),
  today: () => serverLocalDate(),
};

function requireBuiltInCatalog(
  catalog: BuiltInApiCatalog | undefined,
): BuiltInApiCatalog {
  if (!catalog) {
    throw new WorkspaceApiRequestError(
      "adapter_unavailable",
      "Built-in data catalog is unavailable",
    );
  }
  return catalog;
}

function projectCtnBlock(block: CtnCanonicalBlock): MobileCtnBlockDto {
  return {
    children: block.children.map(projectCtnBlock),
    id: block.id,
    label: block.label,
    level: block.level,
    lineNumber: block.lineNumber,
    text: block.text,
    type: block.type,
  };
}

function projectJournalSummary(
  entry: JournalEntry,
): MobileJournalEntrySummaryDto {
  const title = formatJournalEntryTitle(
    entry.createdAt,
    entry.timezoneOffsetMinutes,
    entry.sequence,
  );

  return {
    createdAt: entry.createdAt,
    id: entry.id,
    month: title.slice(0, 7),
    title,
    updatedAt: entry.updatedAt,
  };
}

function parseJournalQuery(url: URL) {
  const allowed = new Set(["cursor", "limit"]);

  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new WorkspaceApiRequestError(
        "invalid_request",
        "Journal pagination query is invalid",
      );
    }
  }
  const limitSource = url.searchParams.get("limit");
  const limit = limitSource === null ? 50 : Number(limitSource);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new WorkspaceApiRequestError(
      "invalid_request",
      "Journal page limit must be between 1 and 100",
    );
  }
  return { cursor: url.searchParams.get("cursor"), limit };
}

async function loadJournal(catalog: BuiltInApiCatalog) {
  const snapshot = await catalog.getStore("journal").then((store) =>
    store.loadSnapshot()
  );
  const content = validateJournalContent(parseJournalContent(snapshot.content));

  return { content, revision: snapshot.revision };
}

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
    rule: projection.currentStage?.rule ?? recurrence.stages.at(-1)!.rule,
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

    if (block.type !== todoItemSemanticType) return children;
    const projection = recurrenceById.get(block.id);
    const completedAt = projection?.active
      ? projection.completedAt
      : ordinaryCompletionById.get(block.id) ?? null;

    return [{
      children,
      completed: completedAt !== null,
      completedAt,
      id: block.id,
      label: block.label,
      level: block.level,
      lineNumber: block.lineNumber,
      recurrence: recurrenceProjection(collection, block.id, today),
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
  content: TodoContent,
  collection: TodoCollection,
  today: TodoLocalDate,
) {
  const profile = requireTodoSyntaxProfile(content.syntaxSource);
  const parsed = parseTodoCollection(collection, profile);
  const roots = parsed.document.roots.filter(
    ({ type }) => type !== profile.titleRule.type,
  );
  const tasks = projectTodoTasks(collection, roots, today);
  const flat = flattenMobileTasks(tasks);
  const summary: MobileTodoCollectionSummaryDto = {
    completedTaskCount: flat.filter(({ completed }) => completed).length,
    id: collection.id,
    name: parsed.name,
    taskCount: flat.length,
  };

  return { summary, tasks };
}

async function loadTodo(catalog: BuiltInApiCatalog) {
  const snapshot = await catalog.getStore("todo").then((store) =>
    store.loadSnapshot()
  );
  const content = validateTodoContent(parseTodoContent(snapshot.content));

  return { content, revision: snapshot.revision };
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
  const collection = content.collections.find(({ id }) => id === collectionId);

  if (!collection) {
    throw new MobileApiRequestError(
      "not_found",
      "Todo collection does not exist",
      { statusCode: 404 },
    );
  }
  return collection;
}

export async function handleMobileApiRoute({
  builtInCatalog,
  readJsonBody,
  route,
  runtime,
  url,
}: {
  builtInCatalog: BuiltInApiCatalog | undefined;
  readJsonBody(): Promise<unknown>;
  route: MobileApiRoute;
  runtime: MobileApiRuntime;
  url: URL;
}): Promise<{
  body:
    | MobileCapabilityStatusDto
    | MobileJournalEntriesPageDto
    | MobileJournalEntryDto
    | MobileTodoCollectionsDto
    | MobileTodoCollectionDto
    | MobileTodoCompletionResultDto;
  statusCode: number;
}> {
  if (route.kind === "mobile-status") {
    if (!builtInCatalog) {
      const fault: MobileBuiltInStatusDto = {
        message: "Built-in data catalog is unavailable",
        status: "fault",
      };

      return {
        body: {
          capabilities: {
            journal: "read-only",
            todo: "completion-write",
          },
          contractVersion: cognitionMobileContractVersion,
          domains: { journal: fault, todo: fault },
        },
        statusCode: 200,
      };
    }
    const catalog = await builtInCatalog.listBuiltIns();
    const projectStatus = (id: "journal" | "todo"): MobileBuiltInStatusDto => {
      if (catalog.repositories.some((repository) => repository.id === id)) {
        return { status: "ready" };
      }
      const issue = catalog.issues.find((candidate) => candidate.id === id);

      return {
        ...(issue ? { message: issue.message } : {}),
        status: "fault",
      };
    };

    return {
      body: {
        capabilities: {
          journal: "read-only",
          todo: "completion-write",
        },
        contractVersion: cognitionMobileContractVersion,
        domains: {
          journal: projectStatus("journal"),
          todo: projectStatus("todo"),
        },
      },
      statusCode: 200,
    };
  }
  const catalog = requireBuiltInCatalog(builtInCatalog);

  if (route.kind === "mobile-journal-entries") {
    const { content, revision } = await loadJournal(catalog);
    const { cursor, limit } = parseJournalQuery(url);
    const entries = listJournalEntriesNewestFirst(content);
    const cursorIndex = cursor === null
      ? -1
      : entries.findIndex(({ id }) => id === cursor);

    if (cursor !== null && cursorIndex < 0) {
      throw new WorkspaceApiRequestError(
        "invalid_request",
        "Journal page cursor is stale",
      );
    }
    const page = entries.slice(cursorIndex + 1, cursorIndex + 1 + limit);
    const hasMore = cursorIndex + 1 + page.length < entries.length;

    return {
      body: {
        contractVersion: cognitionMobileContractVersion,
        entries: page.map(projectJournalSummary),
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
        revision,
      },
      statusCode: 200,
    };
  }
  if (route.kind === "mobile-journal-entry") {
    const { content, revision } = await loadJournal(catalog);

    if (!isJournalEntryId(route.entryId)) {
      throw new MobileApiRequestError(
        "not_found",
        "Journal entry does not exist",
        { statusCode: 404 },
      );
    }
    const entry = findJournalEntry(content, route.entryId);

    if (!entry) {
      throw new MobileApiRequestError(
        "not_found",
        "Journal entry does not exist",
        { statusCode: 404 },
      );
    }
    const profile = requireJournalSyntaxProfile(content.syntaxSource);
    const projection = createJournalEntryBodyProjection(entry, profile);

    return {
      body: {
        blocks: projection.document.roots
          .filter(({ type }) => type !== profile.titleRule.type)
          .map(projectCtnBlock),
        contractVersion: cognitionMobileContractVersion,
        entry: projectJournalSummary(entry),
        revision,
      },
      statusCode: 200,
    };
  }
  const { content, revision } = await loadTodo(catalog);
  const today = runtime.today();

  if (route.kind === "mobile-todo-collections") {
    return {
      body: {
        collections: content.collections.map((collection) =>
          projectTodoCollection(content, collection, today).summary
        ),
        contractVersion: cognitionMobileContractVersion,
        revision,
      },
      statusCode: 200,
    };
  }
  const collection = requireTodoCollection(content, route.collectionId);
  const projected = projectTodoCollection(content, collection, today);

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
  const request = parseMobileTodoCompletionRequest(await readJsonBody());

  if (request.expectedRevision !== revision) {
    throw new MobileApiRequestError(
      "revision_conflict",
      "Todo content changed outside the mobile request",
      { currentRevision: revision, statusCode: 409 },
    );
  }
  if (!flattenMobileTasks(projected.tasks).some(({ id }) => id === route.blockId)) {
    throw new MobileApiRequestError(
      "not_found",
      "Todo task does not exist",
      { statusCode: 404 },
    );
  }
  let next: TodoContent;

  try {
    next = setTodoBlockCompletion(content, {
      blockId: route.blockId,
      collectionId: collection.id,
      completed: request.completed,
      completedAt: runtime.now().toISOString(),
      occurrenceDate: request.occurrenceDate,
      today,
    });
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
  const updatedCollection = requireTodoCollection(next, collection.id);
  const updated = projectTodoCollection(next, updatedCollection, today);
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

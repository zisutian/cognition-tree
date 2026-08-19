// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis.ts";
import {
  createMyersTextEdits,
} from "../../core/ctn/metadata/myersTextEdits.ts";
import type {
  CtnEditableSourceChange,
} from "../../core/ctn/metadata/textEdits.ts";
import { DomainNotFoundError } from "../../core/errors/domainErrors.ts";
import {
  createTodoCollection,
  deleteTodoCollection,
  moveTodoCollection,
  renameTodoCollection,
  updateTodoCollectionBody,
} from "../../core/todo/commands/todoCollectionCommands.ts";
import {
  moveTodoBlock,
  type TodoBlockMoveTarget,
} from "../../core/todo/commands/todoBlockCommands.ts";
import {
  setTodoBlockCompletion,
  setTodoBlockRecurrence,
  stopTodoBlockRecurrence,
  toggleTodoBlock,
} from "../../core/todo/commands/todoCompletionRecurrenceCommands.ts";
import type {
  TodoCommandOutcome,
} from "../../core/todo/commands/todoCommandOutcome.ts";
import {
  createTodoParseIndex,
  type ParsedTodoIndexCollection,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex.ts";
import {
  type TodoCollection,
  type TodoCollectionId,
  type TodoContent,
} from "../../core/todo/model/todoContent.ts";
import {
  isTodoCollectionId,
} from "../../core/todo/model/todoIdentity.ts";
import type {
  TodoLocalDate,
} from "../../core/todo/recurrence/todoLocalDate.ts";
import type {
  TodoRecurrenceRule,
} from "../../core/todo/recurrence/todoRecurrenceRule.ts";
import type {
  TodoRecurrenceStageId,
} from "../../core/todo/recurrence/todoRecurrenceSchedule.ts";
import {
  assertDomainResourceVersion,
} from "../commands/domainCommand.ts";

type ResourceVersion = `sha256:${string}`;

export type TodoDomainVersions = {
  collection(parsed: ParsedTodoIndexCollection): ResourceVersion;
  collectionState(collection: TodoCollection): ResourceVersion;
  itemState(collection: TodoCollection, blockId: string): ResourceVersion;
  order(content: TodoContent): ResourceVersion;
};

type TodoCollectionVersionTarget = {
  collectionId: string;
  expectedVersion?: ResourceVersion;
};

type TodoItemStateVersionTarget = {
  blockId: string;
  collectionId: string;
  expectedStateVersion?: ResourceVersion;
};

export type TodoDomainCommand =
  | {
      body: string;
      collectionId: TodoCollectionId;
      createdAt: string;
      expectedOrderVersion?: ResourceVersion;
      kind: "create-collection";
      name: string;
    }
  | (TodoCollectionVersionTarget & {
      expectedStateVersion?: ResourceVersion;
      kind: "delete-collection";
      timestamp: string;
    })
  | (TodoCollectionVersionTarget & {
      blockId: string;
      kind: "move-block";
      target: TodoBlockMoveTarget;
      updatedAt: string;
    })
  | {
      collectionId: string;
      expectedOrderVersion?: ResourceVersion;
      kind: "move-collection";
      timestamp: string;
      toIndex: number;
    }
  | (TodoCollectionVersionTarget & {
      kind: "rename-collection";
      name: string;
      updatedAt: string;
    })
  | (TodoCollectionVersionTarget & {
      change: CtnEditableSourceChange;
      kind: "replace-collection-body";
      updatedAt: string;
    })
  | (TodoItemStateVersionTarget & {
      completed: boolean;
      completedAt: string;
      kind: "set-completion";
      occurrenceDate: TodoLocalDate | null;
      today: TodoLocalDate;
    })
  | (TodoItemStateVersionTarget & {
      kind: "set-recurrence";
      rule: TodoRecurrenceRule;
      stageId: TodoRecurrenceStageId;
      today: TodoLocalDate;
      updatedAt: string;
    })
  | (TodoItemStateVersionTarget & {
      kind: "stop-recurrence";
      today: TodoLocalDate;
      updatedAt: string;
    })
  | {
      blockId: string;
      collectionId: string;
      completedAt: string;
      kind: "toggle-completion";
      today: TodoLocalDate;
    };

export type PreparedTodoMutation = {
  analysisOverrides?: ReadonlyMap<
    TodoCollectionId,
    CtnCanonicalSourceAnalysis
  >;
  content: TodoContent;
  index: TodoParseIndex;
  outcome: TodoCommandOutcome;
  timestamp: string;
};

function requireParsedCollection(
  content: TodoContent,
  index: TodoParseIndex,
  collectionId: string,
) {
  if (!isTodoCollectionId(collectionId)) {
    throw new DomainNotFoundError(
      collectionId,
      "Todo collection does not exist",
    );
  }
  const collection = content.collections.find(({ id }) => id === collectionId);
  const parsed = index.getParsedCollection(collectionId);

  if (!collection || !parsed) {
    throw new DomainNotFoundError(
      collectionId,
      "Todo collection does not exist",
    );
  }
  return { collection, parsed };
}

function assertCollectionVersion(
  command: TodoCollectionVersionTarget,
  parsed: ParsedTodoIndexCollection,
  versions?: TodoDomainVersions,
) {
  if (!versions) return;
  assertDomainResourceVersion(
    command.expectedVersion,
    versions.collection(parsed),
    parsed.collection.id,
  );
}

function assertItemStateVersion(
  command: TodoItemStateVersionTarget,
  collection: TodoCollection,
  versions?: TodoDomainVersions,
) {
  if (!versions) return;
  assertDomainResourceVersion(
    command.expectedStateVersion,
    versions.itemState(collection, command.blockId),
    `${collection.id}/items/${command.blockId}/state`,
  );
}

export function createTodoBodyReplacement(
  previousBody: string,
  body: string,
): CtnEditableSourceChange {
  return {
    edits: createMyersTextEdits(previousBody, body),
    source: body,
  };
}
export function prepareTodoMutation({
  command,
  content,
  createBlockId,
  index,
  versions,
}: {
  command: TodoDomainCommand;
  content: TodoContent;
  createBlockId: () => string;
  index: TodoParseIndex;
  versions?: TodoDomainVersions;
}): PreparedTodoMutation {
  let next: TodoContent;
  let analysisOverrides:
    | ReadonlyMap<TodoCollectionId, CtnCanonicalSourceAnalysis>
    | undefined;
  let outcome: TodoCommandOutcome = { kind: "ok" };
  let timestamp: string;

  switch (command.kind) {
    case "create-collection": {
      if (versions) {
        assertDomainResourceVersion(
          command.expectedOrderVersion,
          versions.order(content),
          "collections",
        );
      }
      const created = createTodoCollection(content, index, {
        collectionId: command.collectionId,
        createBlockId,
        createdAt: command.createdAt,
        name: command.name,
      });

      next = created.content;
      let analysis = created.analysis;
      if (command.body !== "") {
        const createdIndex = createTodoParseIndex(
          next,
          index,
          new Map([[command.collectionId, analysis]]),
        );
        const updated = updateTodoCollectionBody(next, createdIndex, {
          change: createTodoBodyReplacement("", command.body),
          collectionId: command.collectionId,
          createBlockId,
          updatedAt: command.createdAt,
        });

        next = updated.content;
        analysis = updated.analysis;
      }
      analysisOverrides = new Map([[command.collectionId, analysis]]);
      outcome = {
        collectionId: command.collectionId,
        kind: "todo-collection-created",
      };
      timestamp = command.createdAt;
      break;
    }
    case "delete-collection": {
      const { collection, parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      if (versions) {
        assertDomainResourceVersion(
          command.expectedStateVersion,
          versions.collectionState(collection),
          `${collection.id}/state`,
        );
      }
      next = deleteTodoCollection(content, collection.id);
      timestamp = command.timestamp;
      break;
    }
    case "move-block": {
      const { parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      const moved = moveTodoBlock(content, index, {
        blockId: command.blockId,
        collectionId: parsed.collection.id,
        target: command.target,
        updatedAt: command.updatedAt,
      });

      next = moved.content;
      analysisOverrides = new Map([
        [parsed.collection.id, moved.analysis],
      ]);
      timestamp = command.updatedAt;
      break;
    }
    case "move-collection": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      if (versions) {
        assertDomainResourceVersion(
          command.expectedOrderVersion,
          versions.order(content),
          "collections",
        );
      }
      next = moveTodoCollection(content, {
        collectionId: collection.id,
        toIndex: command.toIndex,
      });
      timestamp = command.timestamp;
      break;
    }
    case "rename-collection": {
      const { parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      next = renameTodoCollection(content, index, {
        collectionId: parsed.collection.id,
        name: command.name,
        updatedAt: command.updatedAt,
      });
      timestamp = command.updatedAt;
      break;
    }
    case "replace-collection-body": {
      const { parsed } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertCollectionVersion(command, parsed, versions);
      const updated = updateTodoCollectionBody(content, index, {
        change: command.change,
        collectionId: parsed.collection.id,
        createBlockId,
        updatedAt: command.updatedAt,
      });

      next = updated.content;
      analysisOverrides = new Map([
        [parsed.collection.id, updated.analysis],
      ]);
      timestamp = command.updatedAt;
      break;
    }
    case "set-completion": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertItemStateVersion(command, collection, versions);
      next = setTodoBlockCompletion(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        completed: command.completed,
        completedAt: command.completedAt,
        occurrenceDate: command.occurrenceDate,
        today: command.today,
      });
      timestamp = command.completedAt;
      break;
    }
    case "set-recurrence": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertItemStateVersion(command, collection, versions);
      next = setTodoBlockRecurrence(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        rule: command.rule,
        stageId: command.stageId,
        today: command.today,
        updatedAt: command.updatedAt,
      });
      timestamp = command.updatedAt;
      break;
    }
    case "stop-recurrence": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      assertItemStateVersion(command, collection, versions);
      next = stopTodoBlockRecurrence(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        today: command.today,
        updatedAt: command.updatedAt,
      });
      timestamp = command.updatedAt;
      break;
    }
    case "toggle-completion": {
      const { collection } = requireParsedCollection(
        content,
        index,
        command.collectionId,
      );

      next = toggleTodoBlock(content, index, {
        blockId: command.blockId,
        collectionId: collection.id,
        completedAt: command.completedAt,
        today: command.today,
      });
      timestamp = command.completedAt;
      break;
    }
  }
  return {
    analysisOverrides,
    content: next,
    index: createTodoParseIndex(next, index, analysisOverrides),
    outcome,
    timestamp,
  };
}

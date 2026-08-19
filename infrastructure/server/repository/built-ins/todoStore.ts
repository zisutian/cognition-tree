// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  WireContractError,
  UnsupportedWireVersionError,
} from "../../../../contracts/common/contractValue.ts";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import {
  parseTodoContent,
} from "../../../../contracts/todo/parseTodo.ts";
import { serializeTodoRevisionContent } from "../../../../contracts/todo/revision.ts";
import type { TodoContentDto, TodoRevisionDto } from "../../../../contracts/todo/types.ts";
import {
  TodoContentValidationError,
} from "../../../../core/todo/model/todoErrors.ts";
import type { TodoParseIndex } from "../../../../core/todo/indexes/todoParseIndex.ts";
import {
  prepareTodoRepositoryContent,
  validateTodoRepositoryPreparedTransition,
} from "../../../../application/todo/persistence/todoRepositoryPreparation.ts";
import { RepositoryCorruptError } from "../store.ts";
import {
  FileSystemVersionedContentStore,
  type VersionedContentStore,
} from "../versioned/contentStore.ts";

export type TodoContentStore = VersionedContentStore<
  TodoContentDto,
  TodoParseIndex
>;

export function createTodoRevision(content: TodoContentDto): TodoRevisionDto {
  return `sha256:${createHash("sha256")
    .update(serializeTodoRevisionContent(content))
    .digest("hex")}`;
}

function validateWriteBoundary<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch (error) {
    if (error instanceof TodoContentValidationError) {
      throw new WireContractError("Todo v4", "$.content", error.message);
    }
    throw error;
  }
}

export function prepareTodoWriteContent(
  content: TodoContentDto,
  previous?: TodoParseIndex | null,
) {
  return validateWriteBoundary(() =>
    prepareTodoRepositoryContent(content, previous)
  );
}

export function createFileSystemTodoContentStore(
  filePath: string,
): TodoContentStore {
  return new FileSystemVersionedContentStore(filePath, {
    createRevision: createTodoRevision,
    normalizeReadError(error) {
      if (error instanceof UnsupportedWireVersionError) return error;
      if (
        error instanceof WireContractError ||
        error instanceof TodoContentValidationError
      ) {
        return new RepositoryCorruptError("Todo content is invalid");
      }
      return error;
    },
    parseContent: parseTodoContent,
    prepareContent: prepareTodoRepositoryContent,
    serializeContent(content) {
      return `${serializeJsonIteratively(content, { indent: 2 })}\n`;
    },
    validateTransition: validateTodoRepositoryPreparedTransition,
    validateWriteBoundary,
  });
}

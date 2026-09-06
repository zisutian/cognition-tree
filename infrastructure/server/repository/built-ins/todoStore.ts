// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  WireContractError,
  UnsupportedWireVersionError,
  serializeJsonIteratively,
} from "../../../../contracts/common/index.ts";

import {
  parseTodoContent,
  serializeTodoRevisionContent,
} from "../../../../contracts/todo/index.ts";

import type { TodoContentDto, TodoRevisionDto } from "../../../../contracts/todo/index.ts";
import {
  TodoContentValidationError,
} from "../../../../core/todo/index.ts";
import type { TodoParseIndex } from "../../../../core/todo/index.ts";
import {
  prepareTodoRepositoryContent,
  validateTodoRepositoryPreparedTransition,
} from "../../../../application/todo/index.ts";
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

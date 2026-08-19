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
  validateTodoContentAnalysisTransition,
} from "../../../../core/todo/model/todoContent.ts";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../../../core/todo/indexes/todoParseIndex.ts";
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

function prepareTodoContent(
  content: TodoContentDto,
  previous?: TodoParseIndex | null,
) {
  try {
    return createTodoParseIndex(content, previous);
  } catch (error) {
    if (error instanceof TodoContentValidationError) throw error;
    throw new TodoContentValidationError(
      `Todo CTN preparation failed: ${
        error instanceof Error ? error.message : "unknown CTN error"
      }`,
    );
  }
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
    prepareContent: prepareTodoContent,
    serializeContent(content) {
      return `${serializeJsonIteratively(content, { indent: 2 })}\n`;
    },
    validateTransition(previous, next) {
      validateTodoContentAnalysisTransition(
        previous.projection.validation,
        next.projection.validation,
      );
    },
    validateWriteBoundary,
  });
}

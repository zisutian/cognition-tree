// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  WireContractError,
  UnsupportedWireVersionError,
} from "../../../contracts/common/contractValue.ts";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import {
  parseTodoCommit,
  parseTodoContent,
} from "../../../contracts/todo/parseTodo.ts";
import { serializeTodoRevisionContent } from "../../../contracts/todo/revision.ts";
import type { TodoContentDto, TodoRevisionDto } from "../../../contracts/todo/types.ts";
import {
  TodoContentValidationError,
  validateTodoContent,
  validateTodoContentTransition,
} from "../../../core/todo/model/todoContent.ts";
import { RepositoryCorruptError } from "./repositoryStore.ts";
import {
  FileSystemVersionedContentStore,
  type VersionedContentStore,
} from "./versionedContentStore.ts";

export type TodoContentStore = VersionedContentStore<TodoContentDto>;

export function createTodoRevision(content: TodoContentDto): TodoRevisionDto {
  return `sha256:${createHash("sha256")
    .update(serializeTodoRevisionContent(content))
    .digest("hex")}`;
}

function validateWriteBoundary(operation: () => void) {
  try {
    operation();
  } catch (error) {
    if (error instanceof TodoContentValidationError) {
      throw new WireContractError("Todo v4", "$.content", error.message);
    }
    throw error;
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
    parseCommit: parseTodoCommit,
    parseContent: parseTodoContent,
    serializeContent(content) {
      return `${serializeJsonIteratively(content, { indent: 2 })}\n`;
    },
    validateContent(content) {
      validateTodoContent(content);
    },
    validateTransition(previous, next) {
      validateTodoContentTransition(previous, next);
    },
    validateWriteBoundary,
  });
}

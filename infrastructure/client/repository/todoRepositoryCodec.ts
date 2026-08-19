// SPDX-License-Identifier: GPL-3.0-or-later

import { parseContentRevision } from "../../../contracts/common/contractValue";
import { parseTodoContent, parseTodoSnapshot } from "../../../contracts/todo/parseTodo";
import {
  TodoContentValidationError,
  validateTodoContent,
  validateTodoContentTransition,
  type TodoContent,
} from "../../../core/todo/model/todoContent";
import type { TodoRevision } from "../../../application/repository/builtInRepository";
import type { VersionedRepositoryCodec } from "../../../application/persistence/versionedRepository";

export const todoRepositoryCodec: VersionedRepositoryCodec<
  TodoContent,
  TodoRevision
> = {
  parseContent: (value) => validateTodoContent(parseTodoContent(value)),
  parseRevision: parseContentRevision,
  parseSnapshot(value) {
    const snapshot = parseTodoSnapshot(value);

    return {
      ...snapshot,
      content: validateTodoContent(snapshot.content),
    };
  },
};

export function validateTodoRepositoryContent(content: TodoContent) {
  try {
    validateTodoContent(content);
  } catch (error) {
    if (error instanceof TodoContentValidationError) {
      throw new Error(`Todo content is invalid: ${error.message}`);
    }
    throw error;
  }
}

export function validateTodoRepositoryTransition(
  previous: TodoContent,
  next: TodoContent,
) {
  try {
    validateTodoContentTransition(previous, next);
  } catch (error) {
    if (error instanceof TodoContentValidationError) {
      throw new Error(`Todo transition is invalid: ${error.message}`);
    }
    throw error;
  }
}

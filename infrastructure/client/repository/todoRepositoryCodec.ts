// SPDX-License-Identifier: GPL-3.0-or-later

import { parseContentRevision } from "../../../contracts/common/contractValue";
import { parseTodoContent, parseTodoSnapshot } from "../../../contracts/todo/parseTodo";
import {
  validateTodoContentAnalysisTransition,
  validateTodoContent,
  validateTodoContentTransition,
} from "../../../core/todo/model/todoValidation";
import { TodoContentValidationError } from "../../../core/todo/model/todoErrors";
import type { TodoContent } from "../../../core/todo/model/todoContent";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex";
import type { TodoRevision } from "../../../application/repository/builtInRepository";
import type {
  VersionedContentPreparationPolicy,
  VersionedRepositoryCodec,
} from "../../../application/persistence/versionedRepository";

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

export const todoRepositoryPreparation: VersionedContentPreparationPolicy<
  TodoContent,
  TodoParseIndex
> = {
  prepare(content, previous) {
    try {
      return createTodoParseIndex(content, previous);
    } catch (error) {
      if (error instanceof TodoContentValidationError) {
        throw new Error(`Todo content is invalid: ${error.message}`);
      }
      throw error;
    }
  },
  validateTransition(previous, next) {
    try {
      validateTodoContentAnalysisTransition(
        previous.projection.validation,
        next.projection.validation,
      );
    } catch (error) {
      if (error instanceof TodoContentValidationError) {
        throw new Error(`Todo transition is invalid: ${error.message}`);
      }
      throw error;
    }
  },
};

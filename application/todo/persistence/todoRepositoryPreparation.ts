// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createTodoParseIndex,
  type TodoParseIndex,
  TodoContentValidationError,
  validateTodoContentAnalysisTransition,
} from "../../../core/todo/index.ts";
import type { TodoContent } from "../../../core/todo/index.ts";
import type {
  PreparedVersionedContent,
} from "../../persistence/index.ts";
import type { VersionedContentPreparationPolicy } from "../../persistence/index.ts";

export function prepareTodoRepositoryContent(
  content: TodoContent,
  previous?: TodoParseIndex | null,
) {
  try {
    return createTodoParseIndex(content, previous);
  } catch (error) {
    if (error instanceof TodoContentValidationError) throw error;
    throw new TodoContentValidationError(
      `Todo CTN preparation failed: ${error instanceof Error ? error.message : "unknown CTN error"
      }`,
    );
  }
}

export function validateTodoRepositoryPreparedTransition(
  previous: PreparedVersionedContent<TodoContent, TodoParseIndex>,
  next: PreparedVersionedContent<TodoContent, TodoParseIndex>,
) {
  validateTodoContentAnalysisTransition(
    previous.projection.validation,
    next.projection.validation,
  );
}



export const todoRepositoryPreparation: VersionedContentPreparationPolicy<
  TodoContent,
  TodoParseIndex
> = {
  prepare(content, previous) {
    try {
      return prepareTodoRepositoryContent(content, previous);
    } catch (error) {
      if (error instanceof TodoContentValidationError) {
        throw new Error(`Todo content is invalid: ${error.message}`);
      }
      throw error;
    }
  },
  validateTransition(previous, next) {
    try {
      validateTodoRepositoryPreparedTransition(previous, next);
    } catch (error) {
      if (error instanceof TodoContentValidationError) {
        throw new Error(`Todo transition is invalid: ${error.message}`);
      }
      throw error;
    }
  },
};

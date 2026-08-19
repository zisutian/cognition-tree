// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex.ts";
import type { TodoContent } from "../../../core/todo/model/todoContent.ts";
import {
  TodoContentValidationError,
} from "../../../core/todo/model/todoErrors.ts";
import {
  validateTodoContentAnalysisTransition,
} from "../../../core/todo/model/todoValidation.ts";
import type {
  PreparedVersionedContent,
} from "../../persistence/versionedRepository.ts";

export function prepareTodoRepositoryContent(
  content: TodoContent,
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

export function validateTodoRepositoryPreparedTransition(
  previous: PreparedVersionedContent<TodoContent, TodoParseIndex>,
  next: PreparedVersionedContent<TodoContent, TodoParseIndex>,
) {
  validateTodoContentAnalysisTransition(
    previous.projection.validation,
    next.projection.validation,
  );
}

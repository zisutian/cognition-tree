// SPDX-License-Identifier: GPL-3.0-or-later

import { parseContentRevision } from "../../../contracts/common/index.ts";
import { parseTodoContent, parseTodoSnapshot } from "../../../contracts/todo/index.ts";
import {
  validateTodoContent,
  validateTodoContentTransition,
  TodoContentValidationError,
} from "../../../core/todo/index.ts";

import type {
  TodoContent,
  TodoParseIndex,
} from "../../../core/todo/index.ts";

import type { TodoRevision } from "../../../application/todo/index.ts";
import {
  prepareTodoRepositoryContent,
  validateTodoRepositoryPreparedTransition,
} from "../../../application/todo/index.ts";
import type {
  VersionedContentPreparationPolicy,
  VersionedRepositoryCodec,
} from "../../../application/persistence/index.ts";

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

// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../../contracts/common/json";
import {
  parseTodoCommit,
  parseTodoCommitResult,
  parseTodoSnapshot,
} from "../../contracts/todo/parseTodo";
import type { TodoRepositoryBackend } from "../../application/repository/builtInRepository";
import {
  validateTodoRepositoryContent,
  validateTodoRepositoryTransition,
} from "../persistence/todoRepository";
import type { HttpRepositoryTransportOptions } from "./httpRepositoryTransport";
import { createHttpVersionedContentRepositoryBackend } from "./httpVersionedContentRepository";

export function createHttpTodoRepositoryBackend({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpRepositoryTransportOptions): TodoRepositoryBackend {
  return createHttpVersionedContentRepositoryBackend({
    baseUrl,
    codec: {
      parseCommit: parseTodoCommit,
      parseCommitResult: parseTodoCommitResult,
      parseSnapshot: parseTodoSnapshot,
      serializeCommit: serializeJsonIteratively,
    },
    endpoint: "/api/v1/sync/todo",
    fetch: fetchFn,
    token,
    validateContent: validateTodoRepositoryContent,
    validateTransition: validateTodoRepositoryTransition,
  });
}

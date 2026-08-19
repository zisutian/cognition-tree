// SPDX-License-Identifier: GPL-3.0-or-later

import {
  executeTodoCommand,
  type TodoCommandExecutionRequest,
} from "../../../../application/todo/todoCommandExecutor.ts";
import type {
  ApiTodoCommandRequestDto,
} from "../../../../contracts/api/types.ts";
import {
  VersionedContentRevisionConflictError,
} from "../../repository/versioned/contentStore.ts";
import {
  createTodoRevision,
  type TodoContentStore,
} from "../../repository/built-ins/todoStore.ts";
import {
  createPreparedCommandStoreAdapter,
} from "../../repository/preparedCommandStoreAdapter.ts";
import { todoResourceVersions } from "../resources/versions.ts";
import type { ApiRuntime } from "../http/runtime.ts";

function toTodoCommandRequest(
  request: ApiTodoCommandRequestDto,
): TodoCommandExecutionRequest {
  return {
    command: request.command,
    mode: request.mode,
    preconditions: request.preconditions,
  } as TodoCommandExecutionRequest;
}

export function executeApiTodoCommand({
  request,
  runtime,
  store,
}: {
  request: ApiTodoCommandRequestDto;
  runtime: ApiRuntime;
  store: TodoContentStore;
}) {
  return executeTodoCommand({
    createRevision: createTodoRevision,
    request: toTodoCommandRequest(request),
    runtime,
    store: createPreparedCommandStoreAdapter(
      store,
      (error) => error instanceof VersionedContentRevisionConflictError,
    ),
    versionPolicy: todoResourceVersions,
  });
}

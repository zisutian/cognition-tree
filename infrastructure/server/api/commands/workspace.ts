// SPDX-License-Identifier: GPL-3.0-or-later

import {
  executeWorkspaceCommand,
  type WorkspaceCommandExecutionRequest,
} from "../../../../application/workspace/commands/workspaceCommandExecutor.ts";
import type {
  ApiWorkspaceCommandRequestDto,
} from "../../../../contracts/api/types.ts";
import {
  WorkspaceRevisionConflictError,
  type WorkspaceRepositoryStore,
} from "../../repository/store.ts";
import {
  createWorkspaceRepositoryRevision,
} from "../../repository/workspace/revision.ts";
import {
  createPreparedCommandStoreAdapter,
} from "../../repository/preparedCommandStoreAdapter.ts";
import { workspaceResourceVersions } from "../resources/versions.ts";
import type { ApiRuntime } from "../http/runtime.ts";

function toWorkspaceCommandRequest(
  request: ApiWorkspaceCommandRequestDto,
): WorkspaceCommandExecutionRequest {
  return {
    command: request.command,
    mode: request.mode,
    preconditions: request.preconditions,
  } as WorkspaceCommandExecutionRequest;
}

export function executeApiWorkspaceCommand({
  request,
  repositoryId,
  runtime,
  store,
}: {
  request: ApiWorkspaceCommandRequestDto;
  repositoryId: string;
  runtime: ApiRuntime;
  store: WorkspaceRepositoryStore;
}) {
  return executeWorkspaceCommand({
    createRevision: createWorkspaceRepositoryRevision,
    repositoryId,
    request: toWorkspaceCommandRequest(request),
    runtime,
    store: createPreparedCommandStoreAdapter(
      store,
      (error) => error instanceof WorkspaceRevisionConflictError,
    ),
    versionPolicy: workspaceResourceVersions,
  });
}

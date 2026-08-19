// SPDX-License-Identifier: GPL-3.0-or-later

import {
  executeJournalCommand,
  type JournalCommandExecutionRequest,
} from "../../../../application/journal/journalCommandExecutor.ts";
import type {
  ApiJournalCommandRequestDto,
} from "../../../../contracts/api/types.ts";
import {
  VersionedContentRevisionConflictError,
} from "../../repository/versioned/contentStore.ts";
import {
  createJournalRevision,
  type JournalContentStore,
} from "../../repository/built-ins/journalStore.ts";
import {
  createPreparedCommandStoreAdapter,
} from "../../repository/preparedCommandStoreAdapter.ts";
import { journalResourceVersions } from "../resources/versions.ts";
import type { ApiRuntime } from "../http/runtime.ts";

function toJournalCommandRequest(
  request: ApiJournalCommandRequestDto,
): JournalCommandExecutionRequest {
  return {
    command: request.command,
    mode: request.mode,
    preconditions: request.preconditions,
  } as JournalCommandExecutionRequest;
}

export function executeApiJournalCommand({
  request,
  runtime,
  store,
}: {
  request: ApiJournalCommandRequestDto;
  runtime: ApiRuntime;
  store: JournalContentStore;
}) {
  return executeJournalCommand({
    createRevision: createJournalRevision,
    request: toJournalCommandRequest(request),
    runtime,
    store: createPreparedCommandStoreAdapter(
      store,
      (error) => error instanceof VersionedContentRevisionConflictError,
    ),
    versionPolicy: journalResourceVersions,
  });
}

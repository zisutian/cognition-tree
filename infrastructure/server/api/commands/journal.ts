// SPDX-License-Identifier: GPL-3.0-or-later

import {
  executeJournalCommand,
  type JournalCommandExecutionRequest,
} from "../../../../application/journal/journalCommandExecutor.ts";
import type {
  ApiV1JournalCommandDto,
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
import type { ApiV1Runtime } from "../http/runtime.ts";

function toJournalCommandRequest(
  command: ApiV1JournalCommandDto,
): JournalCommandExecutionRequest {
  switch (command.kind) {
    case "create-entry":
      return {
        command: { body: command.body, kind: command.kind },
        mode: command.mode,
        preconditions: {
          expectedEntriesVersion: command.expectedEntriesVersion,
        },
      };
    case "delete-entry":
      return {
        command: { entryId: command.entryId, kind: command.kind },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
    case "replace-entry-body":
      return {
        command: {
          body: command.body,
          entryId: command.entryId,
          kind: command.kind,
        },
        mode: command.mode,
        preconditions: { expectedVersion: command.expectedVersion },
      };
  }
}

export function executeApiV1JournalCommand({
  command,
  runtime,
  store,
}: {
  command: ApiV1JournalCommandDto;
  runtime: ApiV1Runtime;
  store: JournalContentStore;
}) {
  return executeJournalCommand({
    createRevision: createJournalRevision,
    request: toJournalCommandRequest(command),
    runtime,
    store: createPreparedCommandStoreAdapter(
      store,
      (error) => error instanceof VersionedContentRevisionConflictError,
    ),
    versionPolicy: journalResourceVersions,
  });
}

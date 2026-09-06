// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalApplicationServices } from "../../../application/journal/index.ts";
import type { TodoApplicationServices } from "../../../application/todo/index.ts";
import { createInitialRepositoryContent } from "../../../application/workspace/index.ts";
import type { SessionCommandDependencies } from "../../../application/workspace/index.ts";
import { createClientUuid as createUuid, clientTodoLocalCalendar, clientClock } from "../platform/index.ts";

export const clientWorkspaceSessionCommandDependencies:
  SessionCommandDependencies = {
    createBlockId: createUuid,
    createFolderId: () => `folder-${createUuid()}`,
    createNoteId: () => `note-${createUuid()}`,
    createSyntaxFileId: () => `syntax-${createUuid()}`,
    now: () => clientClock.now().toISOString(),
  };

export function createClientInitialWorkspaceContent(name: string) {
  const timestamp = clientClock.now().toISOString();

  return createInitialRepositoryContent({
    createBlockId: createUuid,
    createNoteId: () => `note-${createUuid()}`,
    createSyntaxFileId: () => `syntax-${createUuid()}`,
    createWorkspaceId: () => `workspace-${createUuid()}`,
    name,
    timestamp,
  });
}

export function createClientJournalApplicationServices(): JournalApplicationServices {
  return {
    createBlockId: createUuid,
    createEntryId: () => `journal-entry-${createUuid()}`,
    now: () => clientClock.now(),
  };
}

export function createClientTodoApplicationServices(): TodoApplicationServices {
  return {
    createBlockId: createUuid,
    createCollectionId: () => `todo-collection-${createUuid()}`,
    createRecurrenceStageId: () => `todo-recurrence-stage-${createUuid()}`,
    localCalendar: clientTodoLocalCalendar,
    now: () => clientClock.now(),
  };
}

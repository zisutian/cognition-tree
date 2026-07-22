// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalApplicationServices } from "../../application/journal/journalApplication";
import type { TodoApplicationServices } from "../../application/todo/todoApplication";
import type { ApplicationScheduler } from "../../application/runtime/applicationScheduler";
import { createInitialRepositoryContent } from "../../application/workspace/session/initialRepository";
import type { SessionCommandDependencies } from "../../application/workspace/session/sessionCommands";

function createUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("The browser cannot generate identifiers.");
  }
  return globalThis.crypto.randomUUID();
}

export const browserApplicationScheduler: ApplicationScheduler = {
  now: () => globalThis.performance?.now() ?? Date.now(),
  schedule(callback, delayMs) {
    const timer = globalThis.setTimeout(callback, delayMs);

    return () => globalThis.clearTimeout(timer);
  },
};

export const browserWorkspaceSessionCommandDependencies:
  SessionCommandDependencies = {
    createBlockId: createUuid,
    createFolderId: () => `folder-${createUuid()}`,
    createNoteId: () => `note-${createUuid()}`,
    createSyntaxFileId: () => `syntax-${createUuid()}`,
    now: () => new Date().toISOString(),
  };

export function createBrowserInitialWorkspaceContent(name: string) {
  const timestamp = new Date().toISOString();

  return createInitialRepositoryContent({
    createBlockId: createUuid,
    createNoteId: () => `note-${createUuid()}`,
    createSyntaxFileId: () => `syntax-${createUuid()}`,
    createWorkspaceId: () => `workspace-${createUuid()}`,
    name,
    timestamp,
  });
}

export function createBrowserJournalApplicationServices(): JournalApplicationServices {
  return {
    createBlockId: createUuid,
    createEntryId: () => `journal-entry-${createUuid()}`,
    now: () => new Date(),
  };
}

export function createBrowserTodoApplicationServices(): TodoApplicationServices {
  return {
    createBlockId: createUuid,
    createCollectionId: () => `todo-collection-${createUuid()}`,
    now: () => new Date(),
  };
}

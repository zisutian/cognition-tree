// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalApplicationServices } from "../../application/journal/journalApplication";
import type { TodoApplicationServices } from "../../application/todo/todoApplication";
import type { ApplicationScheduler } from "../../application/runtime/applicationScheduler";
import type { ApplicationLocalCalendar } from "../../application/runtime/applicationLocalCalendar";
import { createInitialRepositoryContent } from "../../application/workspace/session/initialRepository";
import type { SessionCommandDependencies } from "../../application/workspace/session/sessionCommands";

function createUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("The browser cannot generate identifiers.");
  }
  return globalThis.crypto.randomUUID();
}

function browserLocalDate(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as
    ReturnType<ApplicationLocalCalendar["today"]>;
}

export const browserApplicationLocalCalendar: ApplicationLocalCalendar = {
  subscribe(listener) {
    let disposed = false;
    let cancelTimer: (() => void) | null = null;
    let current = browserLocalDate();
    const schedule = () => {
      cancelTimer?.();
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      ).getTime();
      const timer = globalThis.setTimeout(() => {
        if (disposed) return;
        const next = browserLocalDate();

        if (next !== current) {
          current = next;
          listener();
        }
        schedule();
      }, Math.max(1, nextMidnight - now.getTime()));

      cancelTimer = () => globalThis.clearTimeout(timer);
    };

    schedule();
    return () => {
      disposed = true;
      cancelTimer?.();
    };
  },
  today: browserLocalDate,
};

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
    createRecurrenceStageId: () => `todo-recurrence-stage-${createUuid()}`,
    localCalendar: browserApplicationLocalCalendar,
    now: () => new Date(),
  };
}

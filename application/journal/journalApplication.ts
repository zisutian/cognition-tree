// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntryBody,
  updateJournalSyntaxSource,
} from "../../core/journal/commands/journalCommands";
import {
  getJournalCreationTimezoneOffsetMinutes,
  findJournalEntry,
  validateJournalContent,
  type JournalContent,
  type JournalContentValue,
  type JournalEntryId,
} from "../../core/journal/model/journalContent";
import {
  resolveJournalSelection,
  resolveJournalSelectionAfterDelete,
} from "../../core/journal/queries/journalQueries";
import type { JournalSessionState } from "./journalSessionController";
import type {
  JournalFocusRequest,
  JournalViewModel,
} from "./journalViewModel";

export type JournalApplicationServices = {
  createBlockId: () => string;
  createEntryId: () => JournalEntryId;
  now: () => Date;
};

export type JournalRepositorySession = {
  reload: () => Promise<void>;
  state: JournalSessionState;
  updateContent: (update: (current: JournalContent) => JournalContent) => void;
};

export type JournalApplication =
  | {
      reload: () => Promise<void>;
      status: "unavailable";
    }
  | {
      status: "loading";
    }
  | {
      errorMessage: string;
      reload: () => Promise<void>;
      status: "failed";
    }
  | {
      reload: () => Promise<void>;
      status: "ready";
      view: JournalViewModel;
    };

export type JournalDeleteMutationResult = {
  contentBefore: JournalContent;
  deletedEntryId: JournalEntryId;
  nextSelection: JournalEntryId | null;
};

export type JournalMutationActions = {
  createEntry(): JournalEntryId;
  deleteEntry(entryId: JournalEntryId): JournalEntryId | null;
  updateEntryBody(
    entryId: JournalEntryId,
    change: CtnEditableSourceChange,
  ): void;
  updateSyntaxSource(source: string): void;
};

function readBrowserRandomUuid() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("The browser cannot generate journal identifiers.");
  }
  return globalThis.crypto.randomUUID();
}

export function createBrowserJournalApplicationServices(): JournalApplicationServices {
  return {
    createBlockId: readBrowserRandomUuid,
    createEntryId: () => `journal-entry-${readBrowserRandomUuid()}`,
    now: () => new Date(),
  };
}

export function requireJournalContent(
  content: JournalContentValue,
): JournalContent {
  return validateJournalContent(content);
}

function requireJournalMutationContent(
  content: JournalContentValue,
): JournalContent {
  // Ready Journal views already validate the session snapshot. Commands perform
  // their own domain validation, so mutation callbacks only narrow the union
  // here instead of parsing the entire journal an additional time per edit.
  return content as JournalContent;
}

function readNow(services: JournalApplicationServices) {
  const now = services.now();

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Journal time source returned an invalid date.");
  }
  return now;
}

function monotonicTimestamp(requested: string, current: string) {
  return Date.parse(requested) < Date.parse(current) ? current : requested;
}

export function createJournalMutationActions({
  onCreated,
  onDeleted,
  services,
  session,
}: {
  onCreated: (entryId: JournalEntryId) => void;
  onDeleted: (result: JournalDeleteMutationResult) => void;
  services: JournalApplicationServices;
  session: Pick<JournalRepositorySession, "updateContent">;
}): JournalMutationActions {
  return {
    createEntry() {
      const now = readNow(services);
      const createdAt = now.toISOString();
      const entryId = services.createEntryId();
      let createdEntryId: JournalEntryId | null = null;

      session.updateContent((current) => {
        const result = createJournalEntry(
          requireJournalMutationContent(current),
          {
            createBlockId: services.createBlockId,
            createdAt,
            entryId,
            timezoneOffsetMinutes:
              getJournalCreationTimezoneOffsetMinutes(now),
          },
        );

        createdEntryId = result.entryId;
        return result.content;
      });
      if (!createdEntryId) {
        throw new Error("The journal session did not apply the creation.");
      }
      onCreated(createdEntryId);
      return createdEntryId;
    },
    deleteEntry(entryId) {
      const outcome: { value?: JournalDeleteMutationResult } = {};

      session.updateContent((current) => {
        const content = requireJournalMutationContent(current);
        const nextSelection = resolveJournalSelectionAfterDelete(
          content,
          entryId,
        );

        outcome.value = {
          contentBefore: content,
          deletedEntryId: entryId,
          nextSelection,
        };
        return deleteJournalEntry(content, entryId);
      });
      const result = outcome.value;

      if (!result) {
        throw new Error("The journal session did not apply the deletion.");
      }
      onDeleted(result);
      return result.nextSelection;
    },
    updateEntryBody(entryId, change) {
      const requestedUpdatedAt = readNow(services).toISOString();

      session.updateContent((current) => {
        const content = requireJournalMutationContent(current);
        const entry = findJournalEntry(content, entryId);

        if (!entry) {
          throw new Error(`Journal entry does not exist: ${entryId}`);
        }
        return updateJournalEntryBody(content, {
          change,
          createBlockId: services.createBlockId,
          entryId,
          updatedAt: monotonicTimestamp(
            requestedUpdatedAt,
            entry.updatedAt,
          ),
        });
      });
    },
    updateSyntaxSource(source) {
      session.updateContent((current) =>
        updateJournalSyntaxSource(
          requireJournalMutationContent(current),
          source,
        )
      );
    },
  };
}

export function resolveRequestedJournalSelectionAfterDelete({
  contentBefore,
  deletedEntryId,
  nextSelection,
  requestedEntryId,
}: JournalDeleteMutationResult & {
  requestedEntryId: JournalEntryId | null;
}) {
  return resolveJournalSelection(contentBefore, requestedEntryId) ===
      deletedEntryId
    ? nextSelection
    : requestedEntryId;
}

export function normalizeJournalBodyLineNumber(lineNumber: number) {
  return Number.isFinite(lineNumber)
    ? Math.max(1, Math.floor(lineNumber))
    : 1;
}

export function createJournalFocusRequest(
  requestId: number,
  entryId: JournalEntryId,
  lineNumber: number,
): JournalFocusRequest {
  if (!Number.isSafeInteger(requestId) || requestId < 1) {
    throw new Error("Journal focus request id must be a positive integer.");
  }
  return {
    entryId,
    lineNumber: normalizeJournalBodyLineNumber(lineNumber),
    requestId,
  };
}

export function consumeJournalFocusRequest(
  request: JournalFocusRequest | null,
  requestId: number,
) {
  return request?.requestId === requestId ? null : request;
}

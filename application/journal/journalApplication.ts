// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnEditableSourceChange } from "../../core/ctn/metadata/textEdits";
import type {
  CtnCanonicalSourceAnalysis,
} from "../../core/ctn/analysis/sourceAnalysis";
import {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntryBody,
  updateJournalSyntaxSource,
} from "../../core/journal/commands/journalCommands";
import {
  getJournalCreationTimezoneOffsetMinutes,
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
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex";
import type {
  PreparedVersionedContent,
} from "../persistence/versionedSessionController";
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
  mutate: (update: (current: JournalContent) => JournalContent) => void;
  mutatePrepared: (
    update: (
      current: PreparedVersionedContent<
        JournalContent,
        JournalParseIndex
      >,
    ) => PreparedVersionedContent<
      JournalContent,
      JournalParseIndex
    >,
  ) => void;
  reload: () => Promise<void>;
  state: JournalSessionState;
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

export function requireJournalContent(
  content: JournalContentValue,
): JournalContent {
  return validateJournalContent(content);
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

type JournalPreparedMutation = {
  analysisOverrides?: ReadonlyMap<
    JournalEntryId,
    CtnCanonicalSourceAnalysis
  >;
  content: JournalContent;
};

function updateJournalSession(
  session: Pick<JournalRepositorySession, "mutatePrepared">,
  update: (
    content: JournalContent,
    index: JournalParseIndex,
  ) => JournalPreparedMutation,
) {
  session.mutatePrepared(({ content, projection }) => {
    const result = update(content, projection);

    return {
      content: result.content,
      projection: createJournalParseIndex(
        result.content,
        projection,
        result.analysisOverrides,
      ),
    };
  });
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
  session: Pick<JournalRepositorySession, "mutatePrepared">;
}): JournalMutationActions {
  const timestamp = (index: JournalParseIndex, requested: string) =>
    monotonicTimestamp(requested, index.latestTimestamp ?? requested);

  return {
    createEntry() {
      const now = readNow(services);
      const entryId = services.createEntryId();
      let createdEntryId: JournalEntryId | null = null;

      updateJournalSession(session, (content, index) => {
        const createdAt = timestamp(index, now.toISOString());
        const result = createJournalEntry(
          content,
          index,
          {
            createBlockId: services.createBlockId,
            createdAt,
            entryId,
            timezoneOffsetMinutes:
              getJournalCreationTimezoneOffsetMinutes(now),
          },
        );

        createdEntryId = result.entryId;
        return {
          analysisOverrides: new Map([[entryId, result.analysis]]),
          content: result.content,
        };
      });
      if (!createdEntryId) {
        throw new Error("The journal session did not apply the creation.");
      }
      onCreated(createdEntryId);
      return createdEntryId;
    },
    deleteEntry(entryId) {
      const outcome: { value?: JournalDeleteMutationResult } = {};

      updateJournalSession(session, (content) => {
        const nextSelection = resolveJournalSelectionAfterDelete(
          content,
          entryId,
        );

        outcome.value = {
          contentBefore: content,
          deletedEntryId: entryId,
          nextSelection,
        };
        return { content: deleteJournalEntry(content, entryId) };
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

      updateJournalSession(session, (content, index) => {
        const result = updateJournalEntryBody(content, index, {
          change,
          createBlockId: services.createBlockId,
          entryId,
          updatedAt: timestamp(index, requestedUpdatedAt),
        });

        return {
          analysisOverrides: new Map([[entryId, result.analysis]]),
          content: result.content,
        };
      });
    },
    updateSyntaxSource(source) {
      const requestedUpdatedAt = readNow(services).toISOString();

      updateJournalSession(session, (content, index) => {
        const result = updateJournalSyntaxSource(content, index, {
          createBlockId: services.createBlockId,
          source,
          updatedAt: timestamp(index, requestedUpdatedAt),
        });

        return {
          analysisOverrides: result.analysisOverrides,
          content: result.content,
        };
      });
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

// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalWorkspaceReference } from "../../core/journal/indexes/journalParseIndex";

export type JournalWorkspaceReferenceFaultCode =
  | "note-ambiguous"
  | "note-not-found"
  | "repository-name-invalid"
  | "repository-not-found"
  | "repository-unreadable";

export type JournalWorkspaceNoteDestination = {
  description: string;
  id: string;
  kind: "workspace-note";
  label: string;
  lineNumber: 1;
  noteId: string;
  repositoryId: string;
};

export type JournalWorkspaceReferenceResolution =
  | {
      destination: JournalWorkspaceNoteDestination;
      reference: JournalWorkspaceReference;
      status: "resolved";
    }
  | {
      code: JournalWorkspaceReferenceFaultCode;
      message: string;
      reference: JournalWorkspaceReference;
      status: "fault";
    };

export type JournalWorkspaceReferenceResolutionState =
  | { status: "idle" | "loading" }
  | {
      resolutions: JournalWorkspaceReferenceResolution[];
      status: "ready";
    };

export type JournalWorkspaceReferenceResolver = {
  resolve(
    references: readonly JournalWorkspaceReference[],
  ): Promise<JournalWorkspaceReferenceResolution[]>;
};

export type JournalWorkspaceReferenceResolutionPublisher = (
  state: JournalWorkspaceReferenceResolutionState,
) => void;

export function startJournalWorkspaceReferenceResolution({
  publish,
  references,
  resolver,
}: {
  publish: JournalWorkspaceReferenceResolutionPublisher;
  references: readonly JournalWorkspaceReference[];
  resolver: JournalWorkspaceReferenceResolver | null;
}) {
  if (references.length === 0) {
    publish({ resolutions: [], status: "ready" });
    return () => undefined;
  }
  if (!resolver) {
    publish({ status: "idle" });
    return () => undefined;
  }
  let cancelled = false;

  publish({ status: "loading" });
  void resolver.resolve(references).then((resolutions) => {
    if (!cancelled) publish({ resolutions, status: "ready" });
  });
  return () => {
    cancelled = true;
  };
}

export function findJournalWorkspaceReferenceResolution(
  state: JournalWorkspaceReferenceResolutionState,
  sourceEntryId: string,
  targetText: string,
) {
  return state.status === "ready"
    ? state.resolutions.find(
        ({ reference }) =>
          reference.sourceEntryId === sourceEntryId &&
          reference.targetText === targetText,
      ) ?? null
    : null;
}

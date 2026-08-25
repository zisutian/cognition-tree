// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalParseIndex } from "../../core/journal/indexes/journalParseIndex.ts";
import type { JournalContent } from "../../core/journal/model/journalContent.ts";
import { createJournalEntryBodyProjection } from "../../core/journal/model/journalEntryProjection.ts";
import { isJournalEntryId } from "../../core/journal/model/journalIdentity.ts";
import type { DomainChangeSet } from "../../core/sync/domainChangeSet.ts";
import {
  projectAgentProposalLineDiff,
  summarizeAgentProposalBlocks,
  type AgentProposalReview,
  type AgentProposalReviewAction,
} from "../commands/agentProposalReview.ts";
import {
  projectJournalMutation,
  type JournalDomainVersions,
} from "./journalDomainCommands.ts";

export function projectJournalContentChanges(
  before: JournalContent,
  after: JournalContent,
  timestamp: string,
  beforeIndex: JournalParseIndex,
  afterIndex: JournalParseIndex,
  versionPolicy: JournalDomainVersions,
) {
  return projectJournalMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: versionPolicy,
  });
}

export function projectJournalAgentProposalReview({
  afterIndex,
  beforeIndex,
  changes,
}: {
  afterIndex: JournalParseIndex;
  beforeIndex: JournalParseIndex;
  changes: DomainChangeSet;
}): AgentProposalReview {
  const changedIds = new Set([
    ...changes.resources.map(({ resourceId }) => resourceId),
    ...changes.blocks.map(({ resourceId }) => resourceId),
  ].filter(isJournalEntryId));

  return {
    resources: [...changedIds].map((resourceId) => {
      const previous = beforeIndex.entryById.get(resourceId) ?? null;
      const next = afterIndex.entryById.get(resourceId) ?? null;

      if (!previous && !next) {
        throw new Error(
          "Journal proposal review cannot resolve a changed resource",
        );
      }
      const beforeText = previous
        ? createJournalEntryBodyProjection(previous).source
        : "";
      const afterText = next
        ? createJournalEntryBodyProjection(next).source
        : "";
      const actions: AgentProposalReviewAction[] = [];

      if (!previous && next) actions.push("created");
      if (previous && !next) actions.push("deleted");
      if (previous && next && beforeText !== afterText) {
        actions.push("content-updated");
      }
      return {
        actions,
        after: next ? { label: next.title, path: next.title } : null,
        before: previous
          ? { label: previous.title, path: previous.title }
          : null,
        blockSummary: summarizeAgentProposalBlocks(
          changes.blocks.filter((change) =>
            change.resourceId === resourceId
          ),
        ),
        diff: projectAgentProposalLineDiff(beforeText, afterText),
        resourceId,
        type: "journal-entry" as const,
      };
    }),
    storeLabel: null,
  };
}

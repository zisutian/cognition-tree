// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createMyersLineDiff,
} from "../../core/ctn/index.ts";
import type { DomainBlockChange } from "../../core/sync/index.ts";

export type AgentProposalReviewAction =
  | "content-updated"
  | "created"
  | "deleted"
  | "moved"
  | "renamed"
  | "state-updated";

export type AgentProposalReviewResourceType =
  | "journal-entry"
  | "todo-collection"
  | "workspace-folder"
  | "workspace-note";

export type AgentProposalReviewResourceSnapshot = Readonly<{
  label: string;
  path: string;
}>;

export type AgentProposalReviewBlockSummary = Readonly<{
  created: number;
  deleted: number;
  moved: number;
  stateUpdated: number;
  updated: number;
}>;

export type AgentProposalReviewLine = Readonly<{
  afterLineNumber: number | null;
  beforeLineNumber: number | null;
  kind: "added" | "context" | "removed";
  text: string;
}>;

export type AgentProposalReviewHunk = Readonly<{
  lines: readonly AgentProposalReviewLine[];
}>;

export type AgentProposalReviewResource = Readonly<{
  actions: readonly AgentProposalReviewAction[];
  after: AgentProposalReviewResourceSnapshot | null;
  before: AgentProposalReviewResourceSnapshot | null;
  blockSummary: AgentProposalReviewBlockSummary;
  diff: readonly AgentProposalReviewHunk[];
  resourceId: string;
  type: AgentProposalReviewResourceType;
}>;

export type AgentProposalReview = Readonly<{
  resources: readonly AgentProposalReviewResource[];
  storeLabel: string | null;
}>;

export function summarizeAgentProposalBlocks(
  changes: readonly DomainBlockChange[],
): AgentProposalReviewBlockSummary {
  const summary = {
    created: 0,
    deleted: 0,
    moved: 0,
    stateUpdated: 0,
    updated: 0,
  };

  for (const change of changes) {
    if (change.kind === "state-updated") {
      summary.stateUpdated += 1;
    } else {
      summary[change.kind] += 1;
    }
  }
  return summary;
}

type IndexedReviewLine = AgentProposalReviewLine & { index: number };

export function projectAgentProposalLineDiff(
  before: string,
  after: string,
  contextLines = 3,
): AgentProposalReviewHunk[] {
  if (before === after) return [];
  let beforeLineNumber = 1;
  let afterLineNumber = 1;
  const lines: IndexedReviewLine[] = [];

  for (const chunk of createMyersLineDiff(before, after)) {
    for (const text of chunk.lines) {
      const kind = chunk.kind === "equal"
        ? "context"
        : chunk.kind === "delete"
          ? "removed"
          : "added";

      lines.push({
        afterLineNumber: kind === "removed" ? null : afterLineNumber,
        beforeLineNumber: kind === "added" ? null : beforeLineNumber,
        index: lines.length,
        kind,
        text,
      });
      if (kind !== "added") beforeLineNumber += 1;
      if (kind !== "removed") afterLineNumber += 1;
    }
  }
  const changed = lines.filter(({ kind }) => kind !== "context");

  if (changed.length === 0) return [];
  const ranges: Array<{ from: number; to: number }> = [];

  for (const line of changed) {
    const from = Math.max(0, line.index - contextLines);
    const to = Math.min(lines.length, line.index + contextLines + 1);
    const previous = ranges.at(-1);

    if (previous && from <= previous.to) {
      previous.to = Math.max(previous.to, to);
    } else {
      ranges.push({ from, to });
    }
  }
  return ranges.map(({ from, to }) => ({
    lines: lines.slice(from, to).map(({ index: _index, ...line }) => line),
  }));
}

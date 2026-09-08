// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createMyersLineDiff,
} from "../../core/ctn/index.ts";
import type { DomainBlockChange } from "../../core/sync/index.ts";

export type ContentChangeReviewAction =
  | "content-updated"
  | "created"
  | "deleted"
  | "moved"
  | "renamed"
  | "state-updated";

export type ContentChangeReviewResourceType =
  | "journal-entry"
  | "todo-collection"
  | "workspace-folder"
  | "workspace-note";

export type ContentChangeReviewResourceSnapshot = Readonly<{
  label: string;
  path: string;
}>;

export type ContentChangeReviewBlockSummary = Readonly<{
  created: number;
  deleted: number;
  moved: number;
  stateUpdated: number;
  updated: number;
}>;

export type ContentChangeReviewLine = Readonly<{
  afterLineNumber: number | null;
  beforeLineNumber: number | null;
  kind: "added" | "context" | "removed";
  text: string;
}>;

export type ContentChangeReviewHunk = Readonly<{
  lines: readonly ContentChangeReviewLine[];
}>;

export type ContentChangeReviewResource = Readonly<{
  actions: readonly ContentChangeReviewAction[];
  after: ContentChangeReviewResourceSnapshot | null;
  before: ContentChangeReviewResourceSnapshot | null;
  blockSummary: ContentChangeReviewBlockSummary;
  diff: readonly ContentChangeReviewHunk[];
  resourceId: string;
  type: ContentChangeReviewResourceType;
}>;

export type ContentChangeReview = Readonly<{
  resources: readonly ContentChangeReviewResource[];
  storeLabel: string | null;
}>;

export function summarizeContentBlockChanges(
  changes: readonly DomainBlockChange[],
): ContentChangeReviewBlockSummary {
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

type IndexedReviewLine = ContentChangeReviewLine & { index: number };

export function projectContentLineDiff(
  before: string,
  after: string,
  contextLines = 3,
): ContentChangeReviewHunk[] {
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

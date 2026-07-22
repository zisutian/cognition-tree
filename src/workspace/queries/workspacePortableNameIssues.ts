// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getPortableNameIssue,
  type PortableNameIssue,
} from "../../../portable-name/portableName";
import type { WorkspaceStructureIndex } from "../indexes/workspaceStructureIndex";

export type WorkspacePortableNameIssue = {
  id: string;
  issue: PortableNameIssue;
  kind: "folder" | "note";
  name: string;
};

/** Enumerates persisted names without rejecting or rewriting existing data. */
export function collectWorkspacePortableNameIssues(
  workspace: WorkspaceStructureIndex,
): WorkspacePortableNameIssue[] {
  const issues: WorkspacePortableNameIssue[] = [];

  for (const [id, entry] of workspace.noteEntryById) {
    const issue = getPortableNameIssue(entry.header.title);

    if (issue) {
      issues.push({ id, issue, kind: "note", name: entry.header.title });
    }
  }
  for (const [id, entry] of workspace.folderEntryById) {
    const issue = getPortableNameIssue(entry.node.title);

    if (issue) {
      issues.push({ id, issue, kind: "folder", name: entry.node.title });
    }
  }

  return issues.sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
  );
}

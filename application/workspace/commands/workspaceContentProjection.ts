// SPDX-License-Identifier: GPL-3.0-or-later

import { projectWorkspaceMutation } from "./workspaceDomainProjection.ts";
import {
  projectCtnEditableText,
  projectRawCanonicalCtnBody,
} from "../../../core/ctn/index.ts";
import type { NoteTreeNode } from "../../../core/workspace/index.ts";
import {
  projectContentLineDiff,
  summarizeContentBlockChanges,
  type ContentChangeReview,
  type ContentChangeReviewAction,
  type ContentChangeReviewResourceType,
} from "../../commands/index.ts";
import type { DomainChangeSet } from "../../../core/sync/index.ts";
import type {
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparation,
} from "../persistence/workspaceRepository.ts";
import type { WorkspaceResourceVersionPolicy } from "./workspaceCommandPreparation.ts";

export function projectWorkspaceContentChanges(
  repositoryId: string,
  before: WorkspaceRepositoryContent,
  after: WorkspaceRepositoryContent,
  timestamp: string,
  beforePreparation: WorkspaceRepositoryPreparation,
  afterPreparation: WorkspaceRepositoryPreparation,
  versionPolicy: WorkspaceResourceVersionPolicy,
) {
  return projectWorkspaceMutation({
    after: after.workspace,
    afterContext: {
      index: afterPreparation.analysisIndex,
      structure: afterPreparation.workspace,
      syntax: afterPreparation.workspaceSyntax?.syntax ?? null,
    },
    before: before.workspace,
    beforeContext: {
      index: beforePreparation.analysisIndex,
      structure: beforePreparation.workspace,
      syntax: beforePreparation.workspaceSyntax?.syntax ?? null,
    },
    repositoryId,
    timestamp,
    versions: {
      folder: versionPolicy.folder,
      note: versionPolicy.note,
      tree: (workspace) => versionPolicy.tree(before, workspace),
    },
  });
}

export function projectWorkspaceContentReview({
  afterPreparation,
  beforePreparation,
  changes,
  repositoryLabel,
}: {
  afterPreparation: WorkspaceRepositoryPreparation;
  beforePreparation: WorkspaceRepositoryPreparation;
  changes: DomainChangeSet;
  repositoryLabel: string;
}): ContentChangeReview {
  const beforeResources = indexWorkspaceReviewResources(beforePreparation);
  const afterResources = indexWorkspaceReviewResources(afterPreparation);
  const changedIds = new Set([
    ...changes.resources.map(({ resourceId }) => resourceId),
    ...changes.blocks.map(({ resourceId }) => resourceId),
  ].filter((resourceId) => resourceId !== "tree"));
  return {
    resources: [...changedIds].map((resourceId) => {
      const previous = beforeResources.get(resourceId) ?? null;
      const next = afterResources.get(resourceId) ?? null;
      const resource = next ?? previous;

      if (!resource) {
        throw new Error(
          "Workspace proposal review cannot resolve a changed resource",
        );
      }
      const actions: ContentChangeReviewAction[] = [];

      if (!previous && next) actions.push("created");
      if (previous && !next) actions.push("deleted");
      if (previous && next && previous.label !== next.label) {
        actions.push("renamed");
      }
      if (previous && next && previous.parentPath !== next.parentPath) {
        actions.push("moved");
      }
      if (previous && next && previous.text !== next.text) {
        actions.push("content-updated");
      }
      return {
        actions,
        after: next ? { label: next.label, path: next.path } : null,
        before: previous
          ? { label: previous.label, path: previous.path }
          : null,
        blockSummary: summarizeContentBlockChanges(
          changes.blocks.filter((change) =>
            change.resourceId === resourceId
          ),
        ),
        diff: projectContentLineDiff(
          previous?.text ?? "",
          next?.text ?? "",
        ),
        resourceId,
        type: resource.type,
      };
    }),
    storeLabel: repositoryLabel,
  };
}

type WorkspaceReviewResource = Readonly<{
  label: string;
  parentPath: string;
  path: string;
  text: string;
  type: ContentChangeReviewResourceType;
}>;

function indexWorkspaceReviewResources(
  preparation: WorkspaceRepositoryPreparation,
) {
  const resources = new Map<string, WorkspaceReviewResource>();
  const pending: Array<{ ancestors: string[]; node: NoteTreeNode }> =
    preparation.workspace.data.tree.slice().reverse().map((node) => ({
      ancestors: [],
      node,
    }));

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) continue;
    if (current.node.kind === "folder") {
      const pathParts = [...current.ancestors, current.node.title];

      resources.set(current.node.folderId, {
        label: current.node.title,
        parentPath: current.ancestors.join(" / "),
        path: pathParts.join(" / "),
        text: "",
        type: "workspace-folder",
      });
      for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
        const node = current.node.children[index];

        if (node) pending.push({ ancestors: pathParts, node });
      }
      continue;
    }
    const entry = preparation.workspace.noteEntryById.get(current.node.noteId);

    if (!entry) continue;
    const parsed = preparation.analysisIndex?.getParsedNote(current.node.noteId);
    const text = parsed
      ? projectCtnEditableText(parsed.analysis, "body").source
      : projectRawCanonicalCtnBody(entry.note.source);

    resources.set(current.node.noteId, {
      label: entry.header.title,
      parentPath: current.ancestors.join(" / "),
      path: [...current.ancestors, entry.header.title].join(" / "),
      text,
      type: "workspace-note",
    });
  }
  return resources;
}

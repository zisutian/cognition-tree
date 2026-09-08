// SPDX-License-Identifier: GPL-3.0-or-later

import { projectWorkspaceMutation } from "./workspaceDomainProjection.ts";
import {
  projectCtnEditableText,
  projectRawCanonicalCtnBody,
} from "../../../core/ctn/index.ts";
import { listWorkspaceResourcePaths } from "../../../core/workspace/index.ts";
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
  return new Map(listWorkspaceResourcePaths(preparation.workspace).map((resource) => {
    const note = resource.kind === "note" ? preparation.workspace.noteEntryById.get(resource.id) : null;
    const parsed = note ? preparation.analysisIndex?.getParsedNote(resource.id) : null;
    return [resource.id, {
      label: resource.name,
      parentPath: resource.path.split("/").slice(0, -1).join("/"),
      path: resource.path,
      text: parsed ? projectCtnEditableText(parsed.analysis, "body").source : note ? projectRawCanonicalCtnBody(note.note.source) : "",
      type: resource.kind === "note" ? "workspace-note" : "workspace-folder",
    } satisfies WorkspaceReviewResource];
  }));
}

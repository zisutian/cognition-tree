// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoParseIndex } from "../../core/todo/indexes/todoParseIndex.ts";
import type { TodoContent } from "../../core/todo/model/todoContent.ts";
import { createTodoCollectionBodyProjection } from "../../core/todo/model/todoCollectionProjection.ts";
import { isTodoCollectionId } from "../../core/todo/model/todoIdentity.ts";
import type { TodoCollectionId } from "../../core/todo/model/todoContent.ts";
import type { DomainChangeSet } from "../../core/sync/domainChangeSet.ts";
import {
  projectAgentProposalLineDiff,
  summarizeAgentProposalBlocks,
  type AgentProposalReview,
  type AgentProposalReviewAction,
} from "../commands/agentProposalReview.ts";
import type { TodoDomainVersions } from "./todoDomainCommands.ts";
import { projectTodoMutation } from "./todoDomainProjection.ts";

export function projectTodoContentChanges(
  before: TodoContent,
  after: TodoContent,
  timestamp: string,
  beforeIndex: TodoParseIndex,
  afterIndex: TodoParseIndex,
  versionPolicy: TodoDomainVersions,
) {
  return projectTodoMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: versionPolicy,
  });
}

export function projectTodoAgentProposalReview({
  afterIndex,
  beforeIndex,
  changes,
}: {
  afterIndex: TodoParseIndex;
  beforeIndex: TodoParseIndex;
  changes: DomainChangeSet;
}): AgentProposalReview {
  const knownIds = new Set([
    ...beforeIndex.collections.map(({ collection }) => collection.id),
    ...afterIndex.collections.map(({ collection }) => collection.id),
  ]);
  const changedIds = new Set<TodoCollectionId>();

  for (const change of changes.resources) {
    for (const collectionId of knownIds) {
      if (
        change.resourceId === collectionId ||
        change.resourceId.startsWith(`${collectionId}/items/`)
      ) {
        changedIds.add(collectionId);
      }
    }
  }
  for (const change of changes.blocks) {
    if (isTodoCollectionId(change.resourceId)) {
      changedIds.add(change.resourceId);
    }
  }
  const beforeOrder = new Map(
    beforeIndex.collections.map(({ collection }, index) => [collection.id, index]),
  );
  const afterOrder = new Map(
    afterIndex.collections.map(({ collection }, index) => [collection.id, index]),
  );

  return {
    resources: [...changedIds].map((resourceId) => {
      const previous = beforeIndex.collectionById.get(resourceId) ?? null;
      const next = afterIndex.collectionById.get(resourceId) ?? null;
      const beforeText = previous
        ? createTodoCollectionBodyProjection(previous).source
        : "";
      const afterText = next
        ? createTodoCollectionBodyProjection(next).source
        : "";
      const actions: AgentProposalReviewAction[] = [];

      if (!previous && next) actions.push("created");
      if (previous && !next) actions.push("deleted");
      if (previous && next && previous.name !== next.name) {
        actions.push("renamed");
      }
      if (
        previous && next &&
        beforeOrder.get(resourceId) !== afterOrder.get(resourceId)
      ) {
        actions.push("moved");
      }
      if (previous && next && beforeText !== afterText) {
        actions.push("content-updated");
      }
      if (changes.resources.some(({ resourceId: changedResourceId }) =>
        changedResourceId.startsWith(`${resourceId}/items/`)
      )) {
        actions.push("state-updated");
      }
      return {
        actions,
        after: next ? { label: next.name, path: next.name } : null,
        before: previous
          ? { label: previous.name, path: previous.name }
          : null,
        blockSummary: summarizeAgentProposalBlocks(
          changes.blocks.filter((change) =>
            change.resourceId === resourceId
          ),
        ),
        diff: projectAgentProposalLineDiff(beforeText, afterText),
        resourceId,
        type: "todo-collection" as const,
      };
    }),
    storeLabel: null,
  };
}

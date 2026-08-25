// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { projectTodoAgentProposalReview } from "../../../application/todo/todoContentProjection.ts";
import { prepareTodoRepositoryContent } from "../../../application/todo/persistence/todoRepositoryPreparation.ts";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../core/todo/todoTestFixture.ts";

describe("Todo Agent proposal review", () => {
  it("projects collection names and state changes without synthetic resources", () => {
    const empty = createEmptyTodoContent();
    const created = appendTodoTestItem(
      appendTodoTestCollection(empty, {
        collectionIndex: 1,
        name: "发布清单",
      }),
      {
        collectionIndex: 1,
        createdAt: todoTimestamp(2),
        itemIndex: 2,
        text: "检查发布内容",
      },
    );
    const before = prepareTodoRepositoryContent(empty);
    const after = prepareTodoRepositoryContent(created, before);
    const collectionId = todoCollectionId(1);
    const review = projectTodoAgentProposalReview({
      afterIndex: after,
      beforeIndex: before,
      changes: {
        blocks: [{
          blockId: todoBlockId(2),
          kind: "created",
          resourceId: collectionId,
          updatedAt: todoTimestamp(2),
        }],
        occurredAt: todoTimestamp(2),
        resources: [
          {
            domain: "todo",
            kind: "created",
            resourceId: collectionId,
            version: `sha256:${"1".repeat(64)}`,
          },
          {
            domain: "todo",
            kind: "updated",
            resourceId: "collections",
            version: `sha256:${"2".repeat(64)}`,
          },
        ],
      },
    });

    expect(review.resources).toHaveLength(1);
    expect(review.resources[0]).toMatchObject({
      actions: ["created"],
      after: { label: "发布清单", path: "发布清单" },
      before: null,
      blockSummary: { created: 1 },
      resourceId: collectionId,
      type: "todo-collection",
    });
    expect(JSON.stringify(review.resources[0]?.diff)).toContain("检查发布内容");
    expect(JSON.stringify(review)).not.toContain("collections\"");
  });
});

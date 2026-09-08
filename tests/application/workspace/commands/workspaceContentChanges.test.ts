// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { projectWorkspaceContentReview } from "../../../../application/workspace/commands/workspaceContentProjection.ts";
import { prepareWorkspaceRepositoryContent } from "../../../../application/workspace/persistence/workspaceRepositoryPreparation.ts";
import { createContent } from "../session/workspaceSessionTestFixture.ts";

describe("Workspace Agent proposal review", () => {
  it("uses frozen titles and content instead of resource IDs", () => {
    const before = prepareWorkspaceRepositoryContent(
      createContent("测试工作区", "旧标题\n- 旧内容"),
    );
    const after = prepareWorkspaceRepositoryContent(
      createContent("测试工作区", "新标题\n- 新内容"),
      { previous: before },
    );
    const review = projectWorkspaceContentReview({
      afterPreparation: after,
      beforePreparation: before,
      changes: {
        blocks: [{
          blockId: "block-internal",
          kind: "updated",
          resourceId: "note-1",
          updatedAt: "2026-08-25T00:00:00.000Z",
        }],
        occurredAt: "2026-08-25T00:00:00.000Z",
        resources: [{
          domain: "workspace",
          kind: "updated",
          repositoryId: "repository-a",
          resourceId: "note-1",
          version: `sha256:${"1".repeat(64)}`,
        }],
      },
      repositoryLabel: "我的仓库",
    });

    expect(review).toMatchObject({
      resources: [{
        actions: ["renamed", "content-updated"],
        after: { label: "新标题", path: "新标题" },
        before: { label: "旧标题", path: "旧标题" },
        blockSummary: { updated: 1 },
        type: "workspace-note",
      }],
      storeLabel: "我的仓库",
    });
    expect(JSON.stringify(review.resources[0]?.diff)).toContain("旧内容");
    expect(JSON.stringify(review.resources[0]?.diff)).toContain("新内容");
    expect(JSON.stringify(review)).not.toContain("block-internal");
  });
});

import { renderToStaticMarkup } from "../../../../support/presentation/render";
import { describe, expect, it } from "vitest";

import { createAgentActivitySlots } from "../../../../../presentation/activities/agent/AgentActivitySlots";

import { createAgentApplicationFixture } from "../../../../support/presentation/fixtures/agentApplicationFixture";

function renderSlot(slot: React.ReactNode) {
  return renderToStaticMarkup(<>{slot}</>);
}

describe("Agent proposal presentation", () => {
  it("presents proposal changes and destructive confirmation without exposing full internal identities", () => {
    const fixture = createAgentApplicationFixture();
    const proposalId = "00000000-0000-4000-8000-000000000101";
    const resourceId = "note-00000000-0000-4000-8000-000000000102";
    const baseRevision = `sha256:${"1".repeat(64)}` as const;
    const digest = `sha256:${"2".repeat(64)}` as const;
    const session = {
      activeTurnId: null,
      createdAt: "2026-08-25T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000100",
      lastActiveAt: "2026-08-25T00:00:00.000Z",
      messages: [
        {
          content: "请更新正文",
          createdAt: "2026-08-25T00:00:01.000Z",
          id: "00000000-0000-4000-8000-000000000104",
          role: "user" as const,
        },
        {
          content: "已生成 Proposal",
          createdAt: "2026-08-25T00:00:02.000Z",
          id: "00000000-0000-4000-8000-000000000105",
          role: "assistant" as const,
        },
      ],
      problem: null,
      profileDigest: `sha256:${"3".repeat(64)}` as const,
      profileId: "profile-a",
      profileLabel: "27B",
      profileModel: "qwen3.8:27b",
      profileVersion: 1,
      proposals: [
        {
          baseRevision,
          changes: {
            blocks: [],
            occurredAt: "2026-08-25T00:00:00.000Z",
            resources: [
              {
                domain: "workspace" as const,
                kind: "created" as const,
                repositoryId: "repository-a",
                resourceId,
                version: `sha256:${"4".repeat(64)}` as const,
              },
            ],
          },
          destructive: false,
          digest,
          diff: [{ from: 0, insertedText: "- 新内容", resourceId, to: 0 }],
          id: proposalId,
          review: {
            resources: [
              {
                actions: ["created" as const],
                after: { label: "新笔记", path: "新笔记" },
                before: null,
                blockSummary: {
                  created: 1,
                  deleted: 0,
                  moved: 0,
                  stateUpdated: 0,
                  updated: 0,
                },
                diff: [
                  {
                    lines: [
                      {
                        afterLineNumber: 1,
                        beforeLineNumber: null,
                        kind: "added" as const,
                        text: "- 新内容",
                      },
                    ],
                  },
                ],
                resourceId,
                type: "workspace-note" as const,
              },
            ],
            storeLabel: "测试仓库",
          },
          status: "pending" as const,
          store: { domain: "workspace" as const, repositoryId: "repository-a" },
          version: 2,
        },
      ],
      providerDigest: `sha256:${"5".repeat(64)}` as const,
      providerId: "provider-a",
      providerVersion: 1,
      scope: {
        domain: "workspace" as const,
        repositoryId: "repository-a",
        target: { kind: "repository" as const },
      },
      sequence: 1,
      state: "awaiting-approval" as const,
    };
    const agent = {
      ...fixture,
      state: {
        ...fixture.state,
        activeSessionId: session.id,
        sessions: [session],
      },
    };
    const markup = renderSlot(
      createAgentActivitySlots({
        agent,
        creatingSession: false,
        onBeginCreateSession: () => undefined,
        onSelectSession: () => undefined,
      }).detail?.content,
    );
    const conversationMarkup = renderSlot(
      createAgentActivitySlots({
        agent,
        creatingSession: false,
        onBeginCreateSession: () => undefined,
        onSelectSession: () => undefined,
      }).main.content,
    );

    expect(markup).toContain("测试仓库");
    expect(markup).toContain('aria-label="Proposal 摘要"');
    expect(markup).toContain("1 项");
    expect(markup).toContain("新建 1 项");
    expect(markup).toContain("新笔记");
    expect(markup).toContain("- 新内容");
    expect(markup).toContain("技术详情");
    expect(markup).toContain("sha256:11111111…11111111");
    expect(markup).not.toContain(baseRevision);
    expect(markup).not.toContain(digest);
    expect(markup).not.toContain(resourceId);
    expect(conversationMarkup).toContain('data-message-role="user"');
    expect(conversationMarkup).toContain('data-message-role="assistant"');

    const destructiveSession = {
      ...session,
      proposals: [
        {
          ...session.proposals[0]!,
          destructive: true,
          status: "awaiting-destructive-confirmation" as const,
        },
        {
          ...session.proposals[0]!,
          id: "00000000-0000-4000-8000-000000000103",
          status: "rejected" as const,
        },
      ],
      state: "awaiting-destructive-confirmation" as const,
    };
    const destructiveSlots = createAgentActivitySlots({
      agent: {
        ...fixture,
        state: {
          ...fixture.state,
          activeSessionId: destructiveSession.id,
          sessions: [destructiveSession],
        },
      },
      creatingSession: false,
      onBeginCreateSession: () => undefined,
      onSelectSession: () => undefined,
    });
    const destructiveMarkup = renderSlot(
      <>
        {destructiveSlots.detail?.content}
        {destructiveSlots.detail?.footer}
      </>,
    );

    expect(destructiveMarkup).toContain("第 1 份");
    expect(destructiveMarkup).toContain("第 2 份");
    expect(destructiveMarkup).not.toContain('type="checkbox"');
    expect(destructiveMarkup).toContain("确认删除并提交");
  });
});

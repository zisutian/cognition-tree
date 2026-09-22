import { describe, expect, it } from "vitest";
import type { SearchControllerState } from "../../../../../application/search/index";
import type { UiWorkbenchProblems } from "../../../../../application/workbench/index";
import { createAgentApplicationFixture } from "../../../../support/presentation/fixtures/agentApplicationFixture";
import { projectWorkbenchPageProblems } from "../../../../../presentation/shell/workbench/workbenchPageProblems";

const base: UiWorkbenchProblems = {
  errorCount: 0,
  warningCount: 0,
  problems: [],
  status: "ready",
};
const search: SearchControllerState = {
  cursor: null,
  draft: { domains: ["workspace"], query: "合成查询" },
  errorMessage: null,
  faults: [],
  loadingMore: false,
  results: [],
  status: "ready",
  submitted: null,
};
const agent = createAgentApplicationFixture();

describe("current page problems", () => {
  it("projects query, source and scope errors without retaining resolved state", () => {
    const failed = projectWorkbenchPageProblems({
      base,
      activeActivityId: "search",
      application: {
        agent,
        search: {
          state: {
            ...search,
            draft: { ...search.draft, domains: [] },
            errorMessage: "查询失败",
            faults: [
              {
                domain: "todo",
                code: "source_unavailable",
                message: "事项来源故障",
              },
            ],
          },
        },
      },
    });
    expect(failed.problems.map(({ message }) => message)).toEqual([
      "查询失败",
      "至少选择一个范围。",
      "事项来源故障",
    ]);
    expect(failed.errorCount).toBe(3);
    expect(
      projectWorkbenchPageProblems({
        base,
        activeActivityId: "search",
        application: { agent, search: { state: search } },
      }),
    ).toEqual(base);
  });

  it("only projects the current settings page error and preserves its recovery target", () => {
    const input = {
      base,
      application: { agent, search: { state: search } },
      errorMessage: "设置草稿无法保存",
    };
    expect(
      projectWorkbenchPageProblems({ ...input, activeActivityId: "settings" })
        .problems,
    ).toMatchObject([
      {
        message: input.errorMessage,
        target: { kind: "activity-problem", activityId: "settings" },
      },
    ]);
    expect(
      projectWorkbenchPageProblems({ ...input, activeActivityId: "notes" })
        .problems,
    ).toEqual([]);
  });

  it("deduplicates a live Agent failure already recorded by its owner", () => {
    const application = {
      agent: { state: { ...agent.state, errorMessage: "会话加载失败" } },
      search: { state: search },
    };
    const first = projectWorkbenchPageProblems({
      base,
      activeActivityId: "agent",
      application,
    });
    expect(first.errorCount).toBe(1);
    expect(
      projectWorkbenchPageProblems({
        base: first,
        activeActivityId: "agent",
        application,
      }),
    ).toEqual(first);
  });
});

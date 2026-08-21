import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SettingsContext,
  SettingsPanel,
} from "../../../../presentation/activities/settings/SettingsPanel";
import {
  appContextDefaultWidth,
} from "../../../../presentation/ui/workbench/frameResize";
import { expectMarkupSemantics } from "../../markupSemantics";
import { createAgentApplicationFixture } from "../../fixtures/agentApplicationFixture";

const apiAccess = {
  administration: {
    createToken: async () => {
      throw new Error("not called during server rendering");
    },
    listAgentOperations: async () => ({ cursor: null, entries: [] }),
    listTokens: async () => [],
    revokeToken: async () => undefined,
  },
  repositories: [{ id: "primary", label: "主仓库" }],
};
const baseAgent = createAgentApplicationFixture();
const agent = {
  ...baseAgent,
  state: {
    ...baseAgent.state,
    preferredProfileId: null,
    status: {
      configurationProblem: null,
      enabled: true,
      profiles: [{
        authenticationStatus: "configured" as const,
        availability: "available" as const,
        id: "codex-safe",
        kind: "codex" as const,
        label: "Codex Safe",
        model: "gpt-5.6-codex",
        unavailableReason: null,
      }],
    },
  },
};

describe("settings activity", () => {
  it("separates interface preferences from scoped server API access", () => {
    const contextMarkup = renderToStaticMarkup(<SettingsContext />);
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        apiAccess={apiAccess}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    const apiMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        apiAccess={apiAccess}
        section="api-access"
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const agentMarkup = renderToStaticMarkup(
      <SettingsPanel
        agent={agent}
        apiAccess={apiAccess}
        section="agent"
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    expect(contextMarkup.match(/<li/g)).toHaveLength(3);
    expectMarkupSemantics(contextMarkup, {
      has: ['aria-current="page"', "界面", "智能体", "API 访问", "<button"],
    });
    expectMarkupSemantics(panelMarkup, {
      has: [
        'aria-label="设置"', "界面", 'id="settings-context-width"',
        `value="${appContextDefaultWidth}"`, "左侧栏宽度",
      ],
      lacks: ["当前仓库", "添加仓库", "危险区"],
    });
    expect(panelMarkup.match(/<input/g)).toHaveLength(1);
    expectMarkupSemantics(apiMarkup, {
      has: [
        "创建令牌",
        "领域权限",
        "Workspace 权限",
        "日记权限",
        "代办权限",
        "仓库范围",
        "现有令牌",
        "Agent 写入审计",
        "/api/v3/content/*",
        "sync、agent 或 admin",
      ],
      lacks: [
        "令牌仅显示这一次",
        "为自动化工具创建独立令牌",
        'type="checkbox"',
        'type="radio"',
      ],
    });
    expect(apiMarkup.match(/<select/g)).toHaveLength(4);
    expectMarkupSemantics(agentMarkup, {
      has: [
        'aria-label="智能体设置"',
        "默认 Profile",
        "Codex Safe",
        "gpt-5.6-codex",
        "codex",
        "认证已配置",
        "刷新状态",
        "重启或 recreate 服务",
      ],
      lacks: ["API Key", "base URL"],
    });
  });
});

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

describe("settings activity", () => {
  it("separates interface preferences from scoped server API access", () => {
    const contextMarkup = renderToStaticMarkup(<SettingsContext />);
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        apiAccess={apiAccess}
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    const apiMarkup = renderToStaticMarkup(
      <SettingsPanel
        apiAccess={apiAccess}
        section="api-access"
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    expect(contextMarkup.match(/<li/g)).toHaveLength(2);
    expectMarkupSemantics(contextMarkup, {
      has: ['aria-current="page"', "界面", "API 访问", "<button"],
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
      ],
      lacks: [
        "令牌仅显示这一次",
        "为自动化工具创建独立令牌",
        'type="checkbox"',
        'type="radio"',
      ],
    });
    expect(apiMarkup.match(/<select/g)).toHaveLength(4);
  });
});

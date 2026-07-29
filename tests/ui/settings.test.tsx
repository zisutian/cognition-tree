import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SettingsContext,
  SettingsPanel,
} from "../../presentation/activities/views/settings/SettingsPanel";
import {
  appContextDefaultWidth,
} from "../../presentation/ui/workbench/frameResize";
import { expectMarkupSemantics } from "./markupSemantics";

describe("settings activity", () => {
  it("separates interface preferences from scoped server API access", () => {
    const contextMarkup = renderToStaticMarkup(<SettingsContext />);
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    const unavailableMarkup = renderToStaticMarkup(
      <SettingsPanel
        apiAccess={{
          reason: "仅服务器模式可用",
          status: "unavailable",
        }}
        section="api-access"
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );
    const availableMarkup = renderToStaticMarkup(
      <SettingsPanel
        apiAccess={{
          administration: {
            createToken: async () => {
              throw new Error("not called during server rendering");
            },
            listAudit: async () => ({ cursor: null, entries: [] }),
            listTokens: async () => [],
            revokeToken: async () => undefined,
          },
          repositories: [{ id: "primary", label: "主仓库" }],
          status: "available",
        }}
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
    expectMarkupSemantics(unavailableMarkup, {
      has: ["当前存储模式不提供 API", "仅服务器模式可用"],
      lacks: ["创建令牌"],
    });
    expectMarkupSemantics(availableMarkup, {
      has: [
        "创建自动化令牌",
        "领域权限",
        "Workspace 仓库范围",
        "创建令牌",
        "现有令牌",
        "最近自动化操作",
      ],
      lacks: ["令牌仅显示这一次"],
    });
  });
});

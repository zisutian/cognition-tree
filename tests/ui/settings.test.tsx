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
  it("shows the single Interface context item and only the context width setting", () => {
    const contextMarkup = renderToStaticMarkup(<SettingsContext />);
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        workbench={{
          contextWidth: appContextDefaultWidth,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    expect(contextMarkup.match(/<li/g)).toHaveLength(1);
    expectMarkupSemantics(contextMarkup, {
      has: ['aria-current="page"', "界面"],
      lacks: ["<button"],
    });
    expectMarkupSemantics(panelMarkup, {
      has: [
        'aria-label="设置"', "界面", 'id="settings-context-width"',
        `value="${appContextDefaultWidth}"`, "左侧栏宽度",
      ],
      lacks: ["当前仓库", "添加仓库", "危险区"],
    });
    expect(panelMarkup.match(/<input/g)).toHaveLength(1);
  });
});

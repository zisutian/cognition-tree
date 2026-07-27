import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SettingsContext,
  SettingsPanel,
} from "../../presentation/activities/views/settings/SettingsPanel";

describe("settings activity", () => {
  it("shows the single Interface context item and only the context width setting", () => {
    const contextMarkup = renderToStaticMarkup(<SettingsContext />);
    const panelMarkup = renderToStaticMarkup(
      <SettingsPanel
        workbench={{
          contextWidth: 280,
          onContextWidthChange: () => undefined,
        }}
      />,
    );

    expect(contextMarkup.match(/<li/g)).toHaveLength(1);
    expect(contextMarkup).toContain('aria-current="page"');
    expect(contextMarkup).toContain("界面");
    expect(contextMarkup).not.toContain("<button");
    expect(panelMarkup).toContain('aria-label="设置"');
    expect(panelMarkup).toContain("界面");
    expect(panelMarkup).toContain('id="settings-context-width"');
    expect(panelMarkup).toContain('value="280"');
    expect(panelMarkup).toContain("左侧栏宽度");
    expect(panelMarkup.match(/<input/g)).toHaveLength(1);
    expect(panelMarkup).not.toContain("当前仓库");
    expect(panelMarkup).not.toContain("添加仓库");
    expect(panelMarkup).not.toContain("危险区");
  });
});

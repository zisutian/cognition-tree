import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  UiButton,
  UiEmptyState,
  UiField,
  UiFormSection,
  UiList,
  UiListRow,
  UiPanel,
  UiPanelBody,
  UiPanelHeader,
  UiSection,
  UiSectionTitle,
  UiStatus,
} from "../../../src/ui/shared/primitives";

describe("ui primitives", () => {
  it("renders shared panel, form, list, status and empty state classes", () => {
    const markup = renderToStaticMarkup(
      <UiPanel aria-label="示例" fullWidth variant="main">
        <UiPanelHeader
          actions={
            <UiButton type="button" variant="secondary">
              操作
            </UiButton>
          }
          leadingActions={
            <UiButton aria-label="收起" type="button" variant="icon">
              ←
            </UiButton>
          }
          stats={["1 项"]}
          title="示例面板"
        />
        <UiPanelBody>
          <UiFormSection
            actions={
              <UiButton aria-label="删除" type="button" variant="icon">
                x
              </UiButton>
            }
            title="表单"
          >
            <UiField label="名称">
              <input defaultValue="demo" />
            </UiField>
          </UiFormSection>
          <UiSection>
            <UiSectionTitle>列表</UiSectionTitle>
            <UiList variant="cards">
              <UiListRow>
                <span>行</span>
              </UiListRow>
            </UiList>
          </UiSection>
          <UiStatus tone="success">
            <p>完成</p>
          </UiStatus>
          <UiEmptyState description="暂无内容" title="空状态" />
        </UiPanelBody>
      </UiPanel>,
    );

    expect(markup).toContain("ui-panel ui-panel-main ui-panel-full-width");
    expect(markup).toContain("ui-panel-header");
    expect(markup).toContain("ui-panel-leading-actions");
    expect(markup).toContain("ui-panel-title-group");
    expect(markup).toContain("ui-button ui-button-secondary");
    expect(markup).toContain("ui-button ui-button-icon");
    expect(markup).toContain("ui-form-section");
    expect(markup).toContain("ui-field");
    expect(markup).toContain("ui-list ui-list-cards");
    expect(markup).toContain("ui-list-row");
    expect(markup).toContain("ui-status ui-status-success");
    expect(markup).toContain("ui-empty-state");
  });
});

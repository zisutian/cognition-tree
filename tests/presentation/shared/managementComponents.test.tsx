// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../../presentation/ui/shared/FormLayout";
import {
  ManagementList,
  ManagementRow,
} from "../../../presentation/ui/shared/ManagementList";
import {
  StatusBadge,
} from "../../../presentation/ui/shared/StatusPresentation";
import {
  getSubsectionTabTargetIndex,
  SubsectionTabs,
} from "../../../presentation/ui/shared/SubsectionTabs";
import { Button, EmptyState } from "../../../presentation/ui/shared/primitives";

describe("shared management components", () => {
  it("renders tabs with one controlled panel and keyboard targets", () => {
    const markup = renderToStaticMarkup(
      <SubsectionTabs
        ariaLabel="智能体设置页面"
        onChange={() => undefined}
        options={[
          { label: "概览", value: "overview" },
          { label: "Provider", value: "providers" },
          { label: "Profile", value: "profiles" },
        ]}
        value="providers"
      >
        Provider 列表
      </SubsectionTabs>,
    );

    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/g)).toHaveLength(3);
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain("Provider 列表");
    expect(getSubsectionTabTargetIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(getSubsectionTabTargetIndex(2, "ArrowRight", 3)).toBe(0);
    expect(getSubsectionTabTargetIndex(1, "Home", 3)).toBe(0);
    expect(getSubsectionTabTargetIndex(1, "End", 3)).toBe(2);
    expect(getSubsectionTabTargetIndex(1, "Enter", 3)).toBeNull();
  });

  it("associates field labels, help and errors with controls", () => {
    const markup = renderToStaticMarkup(
      <FormLayout>
        <FieldRow
          description="只影响新会话"
          fieldId="profile-name"
          label="名称"
        >
          {(accessibility) => (
            <input {...accessibility} className="ui-input" />
          )}
        </FieldRow>
        <FieldRow
          errorMessage="名称不能为空"
          fieldId="provider-name"
          label="Provider"
        >
          {(accessibility) => (
            <input {...accessibility} className="ui-input" />
          )}
        </FieldRow>
        <FormActions><Button>保存</Button></FormActions>
      </FormLayout>,
    );

    expect(markup).toContain('for="profile-name"');
    expect(markup).toContain('aria-describedby="profile-name-description"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("名称不能为空");
  });

  it("renders status badges and management rows", () => {
    const markup = renderToStaticMarkup(
      <>
        <ManagementList aria-label="Providers">
          <ManagementRow
            actions={<Button>编辑</Button>}
            description="ollama · 本机"
            status={<StatusBadge tone="success">可用</StatusBadge>}
            title="本地 Ollama"
          />
        </ManagementList>
        <EmptyState compact description="尚无记录" title="操作记录" />
      </>,
    );

    expect(markup).toContain('aria-label="Providers"');
    expect(markup).toContain("ui-status-badge-success");
    expect(markup).toContain("ui-empty-state is-compact");
  });
});

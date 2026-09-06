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
import { StatusBadge } from "../../../presentation/ui/shared/StatusPresentation";

import { Button, EmptyState } from "../../../presentation/ui/shared/primitives";
import { InputControl } from "../../../presentation/ui/shared/controls";

describe("shared management components", () => {
  it("associates field labels and errors with shared controls", () => {
    const markup = renderToStaticMarkup(
      <FormLayout>
        <FieldRow fieldId="profile-name" label="名称">
          {(accessibility) => <InputControl {...accessibility} />}
        </FieldRow>
        <FieldRow
          errorMessage="名称不能为空"
          fieldId="provider-name"
          label="Provider"
        >
          {(accessibility) => <InputControl {...accessibility} />}
        </FieldRow>
        <FormActions>
          <Button>保存</Button>
        </FormActions>
      </FormLayout>,
    );

    expect(markup).toContain('for="profile-name"');
    expect(markup).not.toContain("profile-name-description");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("名称不能为空");
  });

  it("renders status badges and management rows", () => {
    const markup = renderToStaticMarkup(
      <>
        <ManagementList aria-label="Providers">
          <ManagementRow
            actions={<Button>编辑</Button>}
            onSelect={() => undefined}
            selected
            status={<StatusBadge tone="success">可用</StatusBadge>}
            title="本地 Ollama"
          />
        </ManagementList>
        <EmptyState compact description="尚无记录" title="操作记录" />
      </>,
    );

    expect(markup).toContain('aria-label="Providers"');
    expect(markup).toContain('aria-current="true"');
  });
});

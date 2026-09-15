// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../../../presentation/ui/shared/FormLayout";
import {
  ManagementList,
  ManagementRow,
} from "../../../../presentation/ui/shared/ManagementList";
import { StatusBadge } from "../../../../presentation/ui/shared/StatusPresentation";

import { Button } from "../../../../presentation/ui/shared/Button";
import { InputControl } from "../../../../presentation/ui/shared/controls";

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
    expect(
      markup.match(/<input[^>]*id="profile-name"[^>]*>/)?.[0],
    ).not.toContain("aria-describedby");
    expect(markup).toContain('aria-invalid="true"');
    const providerInput = markup.match(
      /<input[^>]*id="provider-name"[^>]*>/,
    )?.[0];
    expect(providerInput).toContain('aria-describedby="provider-name-error"');
    expect(markup).toContain('id="provider-name-error"');
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
      </>,
    );

    expect(markup).toContain('aria-label="Providers"');
    expect(markup).toContain('aria-current="true"');
  });
});

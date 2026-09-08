// SPDX-License-Identifier: GPL-3.0-or-later

import type { FormEvent } from "react";
import type { ApiAccessApplication } from "../../../application/apiAccess/index.ts";
import {
  CheckboxGroup,
  SelectControl,
  FieldRow,
  FormLayout,
  InputControl,
} from "../../ui/index.ts";
import {
  automationDomains,
  permissionLevels,
  type ApiAccessDraft,
} from "./apiAccessDraft.ts";

export function ApiAccessSettingsForm({
  busy,
  draft,
  kind,
  onChange,
  onSubmit,
  repositories,
}: {
  busy: boolean;
  draft: ApiAccessDraft;
  kind: "automation" | "trusted";
  onChange(value: ApiAccessDraft): void;
  onSubmit(event: FormEvent): void;
  repositories: ApiAccessApplication["repositories"];
}) {
  return (
    <form id="api-token-form" onSubmit={onSubmit}>
      <fieldset className="ui-form-fields" disabled={busy}>
        <FormLayout layout="stacked">
          <FieldRow fieldId="settings-token-name" label="名称">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                aria-label={
                  kind === "automation" ? "自动化令牌名称" : "可信客户端名称"
                }
                maxLength={80}
                required
                onChange={(event) =>
                  onChange({ ...draft, name: event.currentTarget.value })
                }
                value={draft.name}
              />
            )}
          </FieldRow>
          {kind === "automation" ? (
            <>
              {automationDomains.map(({ id, label, permissionLabel }) => (
                <FieldRow
                  fieldId={`settings-api-${id}-permission`}
                  key={id}
                  label={`${label} 权限`}
                >
                  {(accessibility) => (
                    <SelectControl
                      {...accessibility}
                      aria-label={permissionLabel}
                      onChange={(event) => onChange({
                        ...draft,
                        permissions: { ...draft.permissions, [id]: event.currentTarget.value },
                      })}
                      value={draft.permissions[id]}
                    >
                      {permissionLevels.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </SelectControl>
                  )}
                </FieldRow>
              ))}
              {draft.permissions.workspace !== "none" ? (
                <>
                  <FieldRow
                    fieldId="settings-api-repository-scope"
                    label="仓库范围"
                  >
                    {(accessibility) => (
                      <SelectControl
                        {...accessibility}
                        aria-label="仓库范围"
                        onChange={(event) => onChange({
                          ...draft,
                          repositoryIds: event.currentTarget.value === "all" ? null : [],
                        })}
                        value={draft.repositoryIds === null ? "all" : "selected"}
                      >
                        <option value="all">全部仓库</option>
                        <option disabled={repositories.length === 0} value="selected">指定仓库</option>
                      </SelectControl>
                    )}
                  </FieldRow>
                  {draft.repositoryIds !== null ? (
                    <FieldRow
                      fieldId="settings-api-allowed-repositories"
                      controlKind="group"
                      label="允许的仓库"
                    >
                      {(accessibility) => (
                        <CheckboxGroup
                          {...accessibility}
                          onChange={(value) =>
                            onChange({ ...draft, repositoryIds: value })
                          }
                          options={repositories.map(({ id, label }) => ({
                            ariaLabel: `${label}（${id}）`,
                            label,
                            value: id,
                          }))}
                          values={draft.repositoryIds!}
                        />
                      )}
                    </FieldRow>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </FormLayout>
      </fieldset>
    </form>
  );
}

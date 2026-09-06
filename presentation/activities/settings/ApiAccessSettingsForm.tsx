// SPDX-License-Identifier: GPL-3.0-or-later

import type { FormEvent } from "react";
import type { ApiAccessApplication } from "../../../application/apiAccess/index.ts";
import {
  ChoiceGroup,
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
        <FormLayout>
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
                    <ChoiceGroup
                      {...accessibility}
                      ariaLabel={permissionLabel}
                      mode="single"
                      onChange={(value) =>
                        onChange({
                          ...draft,
                          permissions: { ...draft.permissions, [id]: value },
                        })
                      }
                      options={permissionLevels}
                      value={draft.permissions[id]}
                    />
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
                      <ChoiceGroup
                        {...accessibility}
                        ariaLabel="仓库范围"
                        mode="single"
                        onChange={(value) =>
                          onChange({
                            ...draft,
                            repositoryIds: value === "all" ? null : [],
                          })
                        }
                        options={[
                          { label: "全部仓库", value: "all" },
                          {
                            disabled: repositories.length === 0,
                            label: "指定仓库",
                            value: "selected",
                          },
                        ]}
                        value={
                          draft.repositoryIds === null ? "all" : "selected"
                        }
                      />
                    )}
                  </FieldRow>
                  {draft.repositoryIds !== null ? (
                    <FieldRow
                      fieldId="settings-api-allowed-repositories"
                      label="允许的仓库"
                    >
                      {(accessibility) => (
                        <ChoiceGroup
                          {...accessibility}
                          ariaLabel="允许访问的 Workspace 仓库"
                          layout="wrap"
                          mode="multiple"
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

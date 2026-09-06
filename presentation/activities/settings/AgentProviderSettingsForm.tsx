// SPDX-License-Identifier: GPL-3.0-or-later

import type { FormEvent } from "react";
import {
  CheckboxControl,
  SelectControl,
  InputControl,
  FieldRow,
  FormLayout,
} from "../../ui/index.ts";

import {
  changeAgentProviderDraftAuthentication,
  changeAgentProviderDraftBaseUrl,
  changeAgentProviderDraftKind,
  type AgentProviderDraft,
} from "./agentSettingsDraft.ts";

export function AgentProviderSettingsForm({
  busy,
  draft,
  editing,
  onChange,
  onSubmit,
  formId,
}: {
  busy: boolean;
  draft: AgentProviderDraft;
  editing: boolean;
  onChange(draft: AgentProviderDraft): void;
  onSubmit(event: FormEvent): void;
  formId: string;
}) {
  return (
    <form id={formId} onSubmit={onSubmit}>
      <fieldset className="ui-form-fields" disabled={busy}>
        <FormLayout layout="stacked">
          <FieldRow fieldId="settings-provider-name" label="名称">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                aria-label="Provider 名称"
                onChange={(event) =>
                  onChange({
                    ...draft,
                    label: event.currentTarget.value,
                  })
                }
                required
                value={draft.label}
              />
            )}
          </FieldRow>
          <FieldRow fieldId="settings-provider-kind" label="类型">
            {(accessibility) => (
              <SelectControl
                {...accessibility}
                aria-label="Provider 类型"
                onChange={(event) =>
                  onChange(changeAgentProviderDraftKind(
                    draft,
                    event.currentTarget.value as AgentProviderDraft["kind"],
                  ))
                }
                value={draft.kind}
              >
                <option value="ollama">Ollama</option>
                <option value="openai-chat">OpenAI-compatible</option>
                <option value="codex">Codex</option>
              </SelectControl>
            )}
          </FieldRow>
          {draft.kind !== "codex" ? (
            <FieldRow fieldId="settings-provider-address" label="地址">
              {(accessibility) => (
                <InputControl
                  {...accessibility}
                  aria-label="Provider 地址"
                  sizing="container"
                  onChange={(event) =>
                    onChange(
                      changeAgentProviderDraftBaseUrl(
                        draft,
                        event.currentTarget.value,
                      ),
                    )
                  }
                  required
                  value={draft.baseUrl}
                />
              )}
            </FieldRow>
          ) : null}
          <FieldRow fieldId="settings-provider-authentication" label="认证">
            {(accessibility) => (
              <SelectControl
                {...accessibility}
                aria-label="Provider 认证"
                onChange={(event) =>
                  onChange(changeAgentProviderDraftAuthentication(
                    draft,
                    event.currentTarget.value as AgentProviderDraft["authenticationType"],
                  ))
                }
                value={draft.authenticationType}
              >
                {draft.kind !== "codex" ? <option value="none">无需认证</option> : null}
                <option value="api-key">API Key</option>
                {draft.kind === "codex" ? <option value="chatgpt-device-code">ChatGPT 设备码</option> : null}
              </SelectControl>
            )}
          </FieldRow>
          {draft.authenticationType === "api-key" ? (
            <FieldRow
              fieldId="settings-provider-api-key"
              label="API Key"
              description={editing ? "留空保留已保存的密钥。" : undefined}
            >
              {(accessibility) => (
                <InputControl
                  {...accessibility}
                  aria-label="Provider API Key"
                  autoComplete="new-password"
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      apiKey: event.currentTarget.value,
                    })
                  }
                  required={!editing}
                  type="password"
                  value={draft.apiKey}
                />
              )}
            </FieldRow>
          ) : null}
          {draft.kind !== "codex" ? (
            <FieldRow
              fieldId="settings-provider-private-network"
              label="允许私网访问"
              description="允许连接此服务使用的私有网络地址。"
            >
              {(accessibility) => (
                <CheckboxControl
                  {...accessibility}
                  aria-label="确认 Provider 私网访问"
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      privateNetworkAccessConfirmed:
                        event.currentTarget.checked,
                    })
                  }
                  checked={draft.privateNetworkAccessConfirmed}
                />
              )}
            </FieldRow>
          ) : null}
        </FormLayout>
      </fieldset>
    </form>
  );
}

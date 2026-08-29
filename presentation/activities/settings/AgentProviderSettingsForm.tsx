// SPDX-License-Identifier: GPL-3.0-or-later

import type { FormEvent } from "react";
import { ChoiceGroup, InputControl } from "../../ui/shared/controls";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../ui/shared/FormLayout";
import { Button, ToggleButton } from "../../ui/shared/primitives";
import {
  changeAgentProviderDraftAuthentication,
  changeAgentProviderDraftBaseUrl,
  changeAgentProviderDraftKind,
  type AgentProviderDraft,
} from "./agentSettingsDraft";

export function AgentProviderSettingsForm({
  busy,
  draft,
  editing,
  onCancel,
  onChange,
  onSubmit,
}: {
  busy: boolean;
  draft: AgentProviderDraft;
  editing: boolean;
  onCancel(): void;
  onChange(draft: AgentProviderDraft): void;
  onSubmit(event: FormEvent): void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <FormLayout>
        <FieldRow fieldId="settings-provider-name" label="名称">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              aria-label="Provider 名称"
              onChange={(event) => onChange({
                ...draft,
                label: event.currentTarget.value,
              })}
              required
              value={draft.label}
            />
          )}
        </FieldRow>
        <FieldRow fieldId="settings-provider-kind" label="类型">
          {(accessibility) => (
            <ChoiceGroup
              {...accessibility}
              ariaLabel="Provider 类型"
              mode="single"
              onChange={(kind) => onChange(
                changeAgentProviderDraftKind(draft, kind),
              )}
              options={[
                { label: "Ollama", value: "ollama" },
                { label: "OpenAI-compatible", value: "openai-chat" },
                { label: "Codex", value: "codex" },
              ]}
              value={draft.kind}
            />
          )}
        </FieldRow>
        {draft.kind !== "codex" ? (
          <FieldRow fieldId="settings-provider-address" label="地址">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                aria-label="Provider 地址"
                onChange={(event) => onChange(
                  changeAgentProviderDraftBaseUrl(
                    draft,
                    event.currentTarget.value,
                  ),
                )}
                required
                value={draft.baseUrl}
              />
            )}
          </FieldRow>
        ) : null}
        <FieldRow fieldId="settings-provider-authentication" label="认证">
          {(accessibility) => (
            <ChoiceGroup
              {...accessibility}
              ariaLabel="Provider 认证"
              mode="single"
              onChange={(authenticationType) => onChange(
                changeAgentProviderDraftAuthentication(
                  draft,
                  authenticationType,
                ),
              )}
              options={draft.kind === "codex"
                ? [
                    { label: "API Key", value: "api-key" },
                    { label: "ChatGPT 设备码", value: "chatgpt-device-code" },
                  ]
                : [
                    { label: "无需认证", value: "none" },
                    { label: "API Key", value: "api-key" },
                  ]}
              value={draft.authenticationType}
            />
          )}
        </FieldRow>
        {draft.authenticationType === "api-key" ? (
          <FieldRow fieldId="settings-provider-api-key" label="API Key">
            {(accessibility) => (
              <InputControl
                {...accessibility}
                aria-label="Provider API Key"
                autoComplete="new-password"
                onChange={(event) => onChange({
                  ...draft,
                  apiKey: event.currentTarget.value,
                })}
                required={!editing}
                type="password"
                value={draft.apiKey}
              />
            )}
          </FieldRow>
        ) : null}
        {draft.kind !== "codex" ? (
          <FieldRow fieldId="settings-provider-private-network" label="私网许可">
            {(accessibility) => (
              <ToggleButton
                {...accessibility}
                aria-label="确认 Provider 私网访问"
                onClick={() => onChange({
                  ...draft,
                  privateNetworkAccessConfirmed:
                    !draft.privateNetworkAccessConfirmed,
                })}
                pressed={draft.privateNetworkAccessConfirmed}
              >
                {draft.privateNetworkAccessConfirmed ? "已允许" : "未允许"}
              </ToggleButton>
            )}
          </FieldRow>
        ) : null}
        <FormActions>
          <Button disabled={busy} type="submit" variant="primary">
            {editing ? "保存 Provider" : "创建 Provider"}
          </Button>
          <Button onClick={onCancel} type="button">取消</Button>
        </FormActions>
      </FormLayout>
    </form>
  );
}

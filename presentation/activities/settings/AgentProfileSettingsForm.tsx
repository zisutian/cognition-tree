// SPDX-License-Identifier: GPL-3.0-or-later

import type { FormEvent } from "react";
import type {
  AgentProviderKind,
  AgentProviderView,
} from "../../../application/agent/index.ts";
import {
  ChoiceGroup,
  InputControl,
  SelectControl,
  FieldRow,
  FormActions,
  FormLayout,
  Button,
} from "../../ui/index.ts";


import type { AgentProfileDraft } from "./agentSettingsDraft.ts";

export function AgentProfileSettingsForm({
  busy,
  draft,
  editing,
  modelOptions,
  onCancel,
  onChange,
  onSubmit,
  providers,
  selectedProvider,
}: {
  busy: boolean;
  draft: AgentProfileDraft;
  editing: boolean;
  modelOptions: readonly string[];
  onCancel(): void;
  onChange(draft: AgentProfileDraft): void;
  onSubmit(event: FormEvent): void;
  providers: readonly AgentProviderView[];
  selectedProvider: AgentProviderView | null;
}) {
  return (
    <form onSubmit={onSubmit}>
      <FormLayout>
        <FieldRow fieldId="settings-profile-provider" label="Provider">
          {(accessibility) => (
            <SelectControl
              {...accessibility}
              aria-label="Profile Provider"
              onChange={(event) => onChange({
                ...draft,
                providerId: event.currentTarget.value,
              })}
              required
              value={draft.providerId}
            >
              <option value="">请选择</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </SelectControl>
          )}
        </FieldRow>
        <FieldRow fieldId="settings-profile-name" label="名称">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              aria-label="Profile 名称"
              onChange={(event) => onChange({
                ...draft,
                label: event.currentTarget.value,
              })}
              required
              value={draft.label}
            />
          )}
        </FieldRow>
        <FieldRow fieldId="settings-profile-model" label="模型">
          {(accessibility) => (
            <>
              <InputControl
                {...accessibility}
                aria-label="Profile 模型"
                list="agent-model-options"
                onChange={(event) => onChange({
                  ...draft,
                  model: event.currentTarget.value,
                })}
                required
                value={draft.model}
              />
              <datalist id="agent-model-options">
                {modelOptions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </>
          )}
        </FieldRow>
        <FieldRow fieldId="settings-profile-session-limit" label="会话上限">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              aria-label="Profile 会话上限"
              min="1"
              onChange={(event) => onChange({
                ...draft,
                maxResidentSessions: event.currentTarget.valueAsNumber,
              })}
              required
              type="number"
              value={draft.maxResidentSessions}
            />
          )}
        </FieldRow>
        <FieldRow fieldId="settings-profile-timeout" label="超时毫秒">
          {(accessibility) => (
            <InputControl
              {...accessibility}
              aria-label="Profile 超时"
              min="1"
              onChange={(event) => onChange({
                ...draft,
                timeoutMilliseconds: event.currentTarget.valueAsNumber,
              })}
              required
              type="number"
              value={draft.timeoutMilliseconds}
            />
          )}
        </FieldRow>
        {selectedProvider?.kind === "codex" ? (
          <CodexProfileFields draft={draft} setDraft={onChange} />
        ) : selectedProvider ? (
          <ChatProfileFields
            draft={draft}
            providerKind={selectedProvider.kind}
            setDraft={onChange}
          />
        ) : null}
        <FormActions>
          <Button
            disabled={busy || !selectedProvider}
            type="submit"
            variant="primary"
          >
            {editing ? "保存 Profile" : "创建 Profile"}
          </Button>
          <Button onClick={onCancel} type="button">取消</Button>
        </FormActions>
      </FormLayout>
    </form>
  );
}

function CodexProfileFields({
  draft,
  setDraft,
}: {
  draft: AgentProfileDraft;
  setDraft(value: AgentProfileDraft): void;
}) {
  return (
    <>
      <FieldRow fieldId="settings-profile-reasoning" label="推理强度">
        {(accessibility) => (
          <ChoiceGroup
            {...accessibility}
            ariaLabel="Profile 推理强度"
            mode="single"
            onChange={(reasoningEffort) => setDraft({
              ...draft,
              reasoningEffort,
            })}
            options={[
              { label: "low", value: "low" },
              { label: "medium", value: "medium" },
              { label: "high", value: "high" },
              { label: "xhigh", value: "xhigh" },
            ]}
            value={draft.reasoningEffort}
          />
        )}
      </FieldRow>
      <FieldRow fieldId="settings-profile-input-characters" label="输入字符">
        {(accessibility) => (
          <InputControl
            {...accessibility}
            aria-label="Profile 输入字符"
            min="1"
            onChange={(event) => setDraft({
              ...draft,
              maxInputCharacters: event.currentTarget.valueAsNumber,
            })}
            type="number"
            value={draft.maxInputCharacters}
          />
        )}
      </FieldRow>
      <FieldRow fieldId="settings-profile-output-characters" label="输出字符">
        {(accessibility) => (
          <InputControl
            {...accessibility}
            aria-label="Profile 输出字符"
            min="1"
            onChange={(event) => setDraft({
              ...draft,
              maxOutputCharacters: event.currentTarget.valueAsNumber,
            })}
            type="number"
            value={draft.maxOutputCharacters}
          />
        )}
      </FieldRow>
    </>
  );
}

function ChatProfileFields({
  draft,
  providerKind,
  setDraft,
}: {
  draft: AgentProfileDraft;
  providerKind: AgentProviderKind;
  setDraft(value: AgentProfileDraft): void;
}) {
  return (
    <>
      <FieldRow fieldId="settings-profile-tool-mode" label="工具模式">
        {(accessibility) => (
          <ChoiceGroup
            {...accessibility}
            ariaLabel="Profile 工具模式"
            mode="single"
            onChange={(toolCallMode) => setDraft({
              ...draft,
              toolCallMode,
            })}
            options={providerKind === "ollama"
              ? [
                  { label: "native", value: "native" },
                  { label: "single-json", value: "single-json" },
                ]
              : [{ label: "native", value: "native" }]}
            value={draft.toolCallMode}
          />
        )}
      </FieldRow>
      {providerKind === "ollama" ? (
        <FieldRow fieldId="settings-profile-chat-reasoning" label="推理强度">
          {(accessibility) => (
            <ChoiceGroup
              {...accessibility}
              ariaLabel="Profile Chat 推理强度"
              mode="single"
              onChange={(chatReasoningEffort) => setDraft({
                ...draft,
                chatReasoningEffort,
              })}
              options={[
                { label: "模型默认", value: "model-default" },
                { label: "关闭", value: "none" },
                { label: "low", value: "low" },
                { label: "medium", value: "medium" },
                { label: "high", value: "high" },
              ]}
              value={draft.chatReasoningEffort}
            />
          )}
        </FieldRow>
      ) : null}
      <FieldRow
        fieldId="settings-profile-history-budget"
        label="会话历史预算（字符）"
      >
        {(accessibility) => (
          <InputControl
            {...accessibility}
            aria-label="Profile 会话历史预算（字符）"
            min="1"
            onChange={(event) => setDraft({
              ...draft,
              historyBudgetCharacters: event.currentTarget.valueAsNumber,
            })}
            type="number"
            value={draft.historyBudgetCharacters}
          />
        )}
      </FieldRow>
      <FieldRow fieldId="settings-profile-output-tokens" label="输出 tokens">
        {(accessibility) => (
          <InputControl
            {...accessibility}
            aria-label="Profile 输出 Tokens"
            min="1"
            onChange={(event) => setDraft({
              ...draft,
              maxOutputTokens: event.currentTarget.valueAsNumber,
            })}
            type="number"
            value={draft.maxOutputTokens}
          />
        )}
      </FieldRow>
      <FieldRow fieldId="settings-profile-tool-steps" label="工具步数">
        {(accessibility) => (
          <InputControl
            {...accessibility}
            aria-label="Profile 工具步数"
            min="3"
            onChange={(event) => setDraft({
              ...draft,
              maxToolSteps: event.currentTarget.valueAsNumber,
            })}
            type="number"
            value={draft.maxToolSteps}
          />
        )}
      </FieldRow>
    </>
  );
}

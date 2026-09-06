// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from "react";
import type {
  AgentConfigurationController,
  AgentConfigurationState,
} from "../../../application/agent/index.ts";
import {
  Button,
  ConfirmAction,
  FormSaveActions,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  useFeedback,
} from "../../ui/index.ts";
import {
  agentProviderDraftFrom,
  agentProviderInput,
  createAgentProviderDraft,
} from "./agentSettingsDraft.ts";
import { AgentProviderSettingsForm } from "./AgentProviderSettingsForm.tsx";
import { SettingsPage } from "./SettingsPage.tsx";
import type { SettingsTarget } from "./settingsTypes.ts";
import { useSettingsDraft } from "./useSettingsDraft.ts";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";

type Commands = Pick<
  AgentConfigurationController,
  | "createProvider"
  | "updateProvider"
  | "deleteProvider"
  | "probeProvider"
  | "startCodexDeviceLogin"
  | "cancelCodexDeviceLogin"
  | "clearProviderAuthentication"
>;
export function AgentProviderSettingsPanel({
  commands,
  id,
  onCompleted,
  report,
  state,
}: {
  commands: Commands;
  id: string | null;
  onCompleted(target: SettingsTarget): void;
  report: SettingsInteractionReporter;
  state: AgentConfigurationState;
}) {
  const feedback = useFeedback();
  const [confirming, setConfirming] = useState<"delete" | "clear" | null>(null);
  const configuration = state.configuration;
  const provider = configuration?.providers.find((item) => item.id === id);
  const initial = createAgentProviderDraft();
  const source =
    configuration && (provider || id === null)
      ? {
          revision: configuration.revision,
          value: provider ? agentProviderDraftFrom(provider) : initial,
        }
      : null;
  const draft = useSettingsDraft(initial, source);
  const login = id ? state.codexDeviceLogins[id] : null;
  const busy = state.operationStatus === "working" || draft.submitting;
  const loginPending = login?.status === "pending";
  const unavailable = !configuration || (id !== null && !provider);
  const errorMessage =
    draft.errorMessage ??
    (draft.stale
      ? "配置已更新或对象已移除，请放弃修改并重新载入。"
      : state.errorMessage);
  useSettingsInteraction(report, { ...draft, errorMessage });
  const discard = () => {
    draft.discard();
    if (id && !provider) onCompleted({ kind: "provider", id: null });
  };
  const save = () =>
    feedback.runAction(async () => {
      let savedId = id;
      const receipt = await draft.submit(async (value, baseRevision) => {
        const beforeIds = new Set(
          configuration?.providers.map((item) => item.id),
        );
        const result = id
          ? await commands.updateProvider(
              baseRevision,
              id,
              agentProviderInput(value),
            )
          : await commands.createProvider(
              baseRevision,
              agentProviderInput(value),
            );
        const saved = result.providers.find((item) =>
          id ? item.id === id : !beforeIds.has(item.id),
        );
        if (!saved) throw new Error("服务已响应保存，请刷新配置以确认对象。");
        savedId = saved.id;
        return {
          revision: result.revision,
          value: agentProviderDraftFrom(saved),
        };
      });
      const current = draft.getSnapshot();
      if (receipt && savedId && !current.dirty && !current.stale)
        onCompleted({ kind: "provider", id: savedId });
    });
  return (
    <SettingsPage
      title={provider?.label ?? (id ? "Provider 已移除" : "新建 Provider")}
      label="模型服务设置"
      errorMessage={errorMessage}
      actions={
        <FormSaveActions
          busy={busy}
          canDiscard={draft.dirty || draft.stale}
          canSave={
            !unavailable &&
            !loginPending &&
            !draft.stale &&
            (draft.dirty || id === null)
          }
          formId="provider-settings-form"
          onDiscard={discard}
          saveLabel={id ? "保存 Provider" : "创建 Provider"}
        />
      }
    >
      <AgentProviderSettingsForm
        busy={busy || loginPending || unavailable}
        draft={draft.draft}
        editing={id !== null}
        formId="provider-settings-form"
        onChange={draft.change}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      />
      {provider ? (
        <ToolSection title="连接与认证">
          <div className="ui-actions">
            <Button
              disabled={busy || draft.dirty || draft.stale}
              onClick={() =>
                void feedback.runAction(() =>
                  commands.probeProvider(provider.id),
                )
              }
              type="button"
            >
              探测
            </Button>
            {provider.kind === "codex" &&
            provider.authenticationType === "chatgpt-device-code" &&
            !loginPending ? (
              <Button
                disabled={busy || draft.dirty || draft.stale}
                onClick={() =>
                  void feedback.runAction(() =>
                    commands.startCodexDeviceLogin(provider.id),
                  )
                }
                type="button"
              >
                使用 ChatGPT 登录
              </Button>
            ) : null}
            {loginPending ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void feedback.runAction(() =>
                    commands.cancelCodexDeviceLogin(provider.id),
                  )
                }
                type="button"
              >
                取消登录
              </Button>
            ) : null}
            {provider.authenticationStatus === "configured" ? (
              <ConfirmAction
                confirming={confirming === "clear"}
                disabled={busy || loginPending || draft.dirty || draft.stale}
                label="退出认证"
                onRequest={() => setConfirming("clear")}
                onCancel={() => setConfirming(null)}
                onConfirm={() =>
                  void feedback.runAction(async () => {
                    await commands.clearProviderAuthentication(provider.id);
                    setConfirming(null);
                  })
                }
              />
            ) : null}
          </div>
          {loginPending ? (
            <ToolPropertyList aria-label="ChatGPT 设备登录">
              <ToolPropertyRow
                label="验证地址"
                value={
                  <a
                    href={login.verificationUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    打开登录页
                  </a>
                }
              />
              <ToolPropertyRow
                label="设备码"
                value={<code data-sensitive="true">{login.userCode}</code>}
              />
            </ToolPropertyList>
          ) : null}
        </ToolSection>
      ) : null}
      {provider ? (
        <ToolSection title="删除服务">
          <ConfirmAction
            confirming={confirming === "delete"}
            disabled={busy || loginPending || draft.dirty || draft.stale}
            label="删除 Provider"
            onRequest={() => setConfirming("delete")}
            onCancel={() => setConfirming(null)}
            onConfirm={() =>
              void feedback.runAction(async () => {
                await commands.deleteProvider(provider.id);
                onCompleted({ kind: "provider", id: null });
              })
            }
          />
        </ToolSection>
      ) : null}
    </SettingsPage>
  );
}

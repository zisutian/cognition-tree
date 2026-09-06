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
  ToolSection,
  useFeedback,
} from "../../ui/index.ts";
import {
  agentProfileDraftFrom,
  agentProfileInput,
  createAgentProfileDraft,
} from "./agentSettingsDraft.ts";
import { AgentProfileSettingsForm } from "./AgentProfileSettingsForm.tsx";
import { SettingsPage } from "./SettingsPage.tsx";
import type { SettingsTarget } from "./settingsTypes.ts";
import { useSettingsDraft } from "./useSettingsDraft.ts";
import {
  useSettingsInteraction,
  type SettingsInteractionReporter,
} from "./useSettingsInteraction.ts";

type Commands = Pick<
  AgentConfigurationController,
  | "createProfile"
  | "updateProfile"
  | "deleteProfile"
  | "checkConformance"
  | "cancelConformance"
>;
export function AgentProfileSettingsPanel({
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
  const [confirming, setConfirming] = useState(false);
  const configuration = state.configuration;
  const profile = configuration?.profiles.find((item) => item.id === id);
  const initial = createAgentProfileDraft();
  const source =
    configuration && (profile || id === null)
      ? {
          revision: configuration.revision,
          value: profile ? agentProfileDraftFrom(profile) : initial,
        }
      : null;
  const draft = useSettingsDraft(initial, source);
  const providers = configuration?.providers ?? [];
  const selectedProvider =
    providers.find((item) => item.id === draft.draft.providerId) ?? null;
  const check = id ? state.conformanceChecks[id] : null;
  const running = check?.status === "running";
  const busy = state.operationStatus === "working" || draft.submitting;
  const unavailable = !configuration || (id !== null && !profile);
  const errorMessage =
    draft.errorMessage ??
    (draft.stale
      ? "配置已更新或对象已移除，请放弃修改并重新载入。"
      : state.errorMessage);
  useSettingsInteraction(report, { ...draft, errorMessage });
  const save = () =>
    feedback.runAction(async () => {
      if (!selectedProvider) return;
      let savedId = id;
      const receipt = await draft.submit(async (value, baseRevision) => {
        const beforeIds = new Set(
          configuration?.profiles.map((item) => item.id),
        );
        const input = agentProfileInput(value, selectedProvider.kind);
        const result = id
          ? await commands.updateProfile(baseRevision, id, input)
          : await commands.createProfile(baseRevision, input);
        const saved = result.profiles.find((item) =>
          id ? item.id === id : !beforeIds.has(item.id),
        );
        if (!saved) throw new Error("服务已响应保存，请刷新配置以确认对象。");
        savedId = saved.id;
        return {
          revision: result.revision,
          value: agentProfileDraftFrom(saved),
        };
      });
      const current = draft.getSnapshot();
      if (receipt && savedId && !current.dirty && !current.stale)
        onCompleted({ kind: "profile", id: savedId });
    });
  return (
    <SettingsPage
      title={profile?.label ?? (id ? "Profile 已移除" : "新建 Profile")}
      label="会话配置设置"
      errorMessage={errorMessage}
      actions={
        <FormSaveActions
          busy={busy}
          canDiscard={draft.dirty || draft.stale}
          canSave={
            !unavailable &&
            !running &&
            !draft.stale &&
            !!selectedProvider &&
            (draft.dirty || id === null)
          }
          formId="profile-settings-form"
          onDiscard={() => {
            draft.discard();
            if (id && !profile) onCompleted({ kind: "profile", id: null });
          }}
          saveLabel={id ? "保存 Profile" : "创建 Profile"}
        />
      }
    >
      <AgentProfileSettingsForm
        busy={busy || running || unavailable}
        draft={draft.draft}
        formId="profile-settings-form"
        modelOptions={[
          ...new Set([
            ...(state.discovery?.models ?? []),
            ...Object.values(state.probes).flatMap((probe) => probe.models),
          ]),
        ].sort()}
        onChange={draft.change}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        providers={providers}
        selectedProvider={selectedProvider}
      />
      {profile ? (
        <ToolSection title="检查与管理">
          <div className="ui-actions">
            {profile.parameters.kind === "chat" ? (
              running ? (
                <Button
                  disabled={check.phase === "recording-result"}
                  onClick={() =>
                    void feedback.runAction(() =>
                      commands.cancelConformance(profile.id),
                    )
                  }
                  type="button"
                >
                  {check.phase === "recording-result" ? "正在记录" : "取消检查"}
                </Button>
              ) : (
                <Button
                  disabled={busy || draft.dirty || draft.stale}
                  onClick={() =>
                    void feedback.runAction(() =>
                      commands.checkConformance(profile.id),
                    )
                  }
                  type="button"
                >
                  符合性检查
                </Button>
              )
            ) : null}
            <ConfirmAction
              confirming={confirming}
              disabled={busy || running || draft.dirty || draft.stale}
              label="删除 Profile"
              onRequest={() => setConfirming(true)}
              onCancel={() => setConfirming(false)}
              onConfirm={() =>
                void feedback.runAction(async () => {
                  await commands.deleteProfile(profile.id);
                  onCompleted({ kind: "profile", id: null });
                })
              }
            />
          </div>
        </ToolSection>
      ) : null}
    </SettingsPage>
  );
}

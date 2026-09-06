// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  OwnerAuthenticationController,
  SystemConfigurationController,
  SystemConfigurationInput,
  SystemConfigurationState,
} from "../../../application/system";
import { Button } from "../../ui/shared/primitives";
import { ChoiceGroup, InputControl } from "../../ui/shared/controls";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../ui/shared/FormLayout";
import {
  ToolPanel,
  ToolPanelBody,
  ToolSection,
  ToolSectionStack,
} from "../../ui/shared/ToolSurface";
import type {
  SystemOwnerCredentialPanelView,
} from "./useSystemOwnerCredentialSession";
import {
  useSystemConfigurationDraft,
} from "./useSystemConfigurationDraft";

export type SystemSettingsPanelApplication = Readonly<{
  authenticationController: Pick<OwnerAuthenticationController, "logout">;
  configurationController: Pick<
    SystemConfigurationController,
    "load" | "migrateDataRoot" | "update" | "reconcileMigration" | "getSnapshot"
  >;
  configurationState: SystemConfigurationState;
}>;

function configurationAddress(configuration: SystemConfigurationInput) {
  return configuration.listenMode === "lan"
    ? configuration.publicOrigin
    : `http://127.0.0.1:${configuration.port}`;
}

function reconnectAfterRestart(address: string | null) {
  return globalThis.setTimeout(() => {
    if (!address || address === globalThis.location.origin) {
      globalThis.location.reload();
      return;
    }
    globalThis.location.assign(address);
  }, 750);
}

export function SystemSettingsPanel({
  ownerCredentialSession,
  system,
}: {
  ownerCredentialSession: SystemOwnerCredentialPanelView;
  system: SystemSettingsPanelApplication;
}) {
  const feedback = useFeedback();
  const { authenticationController, configurationController, configurationState } = system;
  const snapshot = configurationState.configuration;
  const configurationDraft = useSystemConfigurationDraft({
    configuration: snapshot,
    controller: configurationController,
  });
  const draft = configurationDraft.draft;
  const [migrationDestination, setMigrationDestination] = useState("");
  const reconnectTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );
  const busy = configurationState.operationStatus === "working" ||
    configurationState.loadStatus === "loading";
  const ownerCredentialPreparation =
    ownerCredentialSession.snapshot.preparation;
  const ownerCredentialAwaitingConfirmation =
    ownerCredentialSession.snapshot.activationStatus ===
      "awaiting-confirmation" && ownerCredentialPreparation !== null;
  const cancelPendingReconnect = useCallback(() => {
    if (reconnectTimerRef.current === null) return;
    globalThis.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);
  const changeDraft = useCallback((nextDraft: SystemConfigurationInput) => {
    cancelPendingReconnect();
    configurationDraft.change(nextDraft);
  }, [cancelPendingReconnect, configurationDraft.change]);
  const discardChanges = useCallback(() => {
    cancelPendingReconnect();
    configurationDraft.discardChanges();
  }, [cancelPendingReconnect, configurationDraft.discardChanges]);

  useLayoutEffect(() => cancelPendingReconnect, [cancelPendingReconnect]);

  if (!snapshot || !draft) {
    return (
      <ToolPanel
        aria-label="服务设置"
        className="settings-panel"
        title="服务"
      >
        <ToolPanelBody layout="form"><p role="alert">{configurationState.errorMessage ?? "正在读取服务设置……"}</p></ToolPanelBody>
      </ToolPanel>
    );
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void feedback.runAction(async () => {
      const result = await configurationDraft.submit();

      if (result.restartConfiguration) {
        cancelPendingReconnect();
        reconnectTimerRef.current = reconnectAfterRestart(
          configurationAddress(result.restartConfiguration),
        );
      }
    });
  };
  return (
    <ToolPanel
      aria-label="服务设置"
      className="settings-panel"
      title="服务"
    >
      <ToolPanelBody layout="form">
        <ToolSectionStack>
          {configurationState.errorMessage ? <p className="settings-api-error" role="alert">{configurationState.errorMessage}</p> : null}
          {configurationDraft.stale ? <p className="settings-api-error" role="alert">服务设置已在其他位置更新。请先载入最新设置。</p> : null}
          <ToolSection title="网络与路径">
            <form onSubmit={submit}>
              <FormLayout>
                <FieldRow fieldId="settings-system-listen-mode" label="访问范围">
                  {(accessibility) => (
                    <ChoiceGroup
                      {...accessibility}
                      ariaLabel="服务访问范围"
                      mode="single"
                      onChange={(value) => changeDraft({
                        ...draft,
                        listenMode: value,
                        publicOrigin: value === "loopback"
                          ? null
                          : draft.publicOrigin,
                      })}
                      options={[
                        { label: "仅本机", value: "loopback" },
                        { label: "局域网", value: "lan" },
                      ]}
                      value={draft.listenMode}
                    />
                  )}
                </FieldRow>
                <FieldRow fieldId="settings-system-port" label="端口">
                  {(accessibility) => (
                    <InputControl {...accessibility} aria-label="服务端口" max="65535" min="1" onChange={(event) => changeDraft({ ...draft, port: event.currentTarget.valueAsNumber })} required type="number" value={draft.port} />
                  )}
                </FieldRow>
                {draft.listenMode === "lan" ? (
                  <FieldRow fieldId="settings-system-public-origin" label="HTTPS 公开地址">
                    {(accessibility) => (
                      <InputControl {...accessibility} aria-label="HTTPS 公开地址" onChange={(event) => changeDraft({ ...draft, publicOrigin: event.currentTarget.value || null })} placeholder="https://tree.example.com" required value={draft.publicOrigin ?? ""} />
                    )}
                  </FieldRow>
                ) : null}
                <FieldRow fieldId="settings-system-host-root" label="宿主机显示路径">
                  {(accessibility) => (
                    <InputControl {...accessibility} aria-label="宿主机仓库显示路径" onChange={(event) => changeDraft({ ...draft, repositoryHostRoot: event.currentTarget.value || null })} value={draft.repositoryHostRoot ?? ""} />
                  )}
                </FieldRow>
                <FieldRow fieldId="settings-system-audit-limit" label="审计保留条数">
                  {(accessibility) => (
                    <InputControl {...accessibility} aria-label="操作审计保留条数" min="1" onChange={(event) => changeDraft({ ...draft, maxAuditEntries: event.currentTarget.valueAsNumber })} required type="number" value={draft.maxAuditEntries} />
                  )}
                </FieldRow>
                <FormActions>
                  <Button disabled={busy || configurationDraft.stale || configurationDraft.submitting || ownerCredentialAwaitingConfirmation} type="submit" variant="primary">保存服务设置</Button>
                  {configurationState.errorMessage ? <Button disabled={busy || configurationDraft.submitting} onClick={() => void configurationController.load()} type="button">重新读取服务设置</Button> : null}
                  {configurationDraft.stale ? <Button disabled={busy || configurationDraft.submitting} onClick={discardChanges} type="button">载入最新设置</Button> : null}
                </FormActions>
              </FormLayout>
            </form>
          </ToolSection>

          <ToolSection title="所有者凭据">
            {ownerCredentialAwaitingConfirmation ? <p>请先保存右侧显示的新密钥，再明确激活；激活失败时密钥会继续保留。</p> : null}
            {ownerCredentialAwaitingConfirmation && configurationState.errorMessage ? <p>激活结果可能未知。请继续保存新密钥并重新读取状态；若旧会话已失效，请用该密钥重新登录。</p> : null}
            {snapshot.ownerCredentialRotationPending && !ownerCredentialPreparation ? <p>服务中存在待激活轮换，但当前页面没有对应明文密钥；请重新准备以替换它。</p> : null}
            <div className="ui-actions">
              {!ownerCredentialPreparation ? <Button disabled={busy} onClick={() => void feedback.runAction(() => ownerCredentialSession.prepareOwnerCredentialRotation())} type="button">{snapshot.ownerCredentialRotationPending ? "重新准备新密钥" : snapshot.ownerCredentialConfigured ? "准备轮换密钥" : "准备创建密钥"}</Button> : null}
              {ownerCredentialAwaitingConfirmation ? <Button disabled={busy} onClick={() => void feedback.runAction(() => ownerCredentialSession.activatePreparedOwnerCredential())} type="button" variant="primary">我已保存，激活新密钥</Button> : null}
              <Button disabled={busy || ownerCredentialPreparation !== null || (!snapshot.ownerCredentialConfigured && !snapshot.ownerCredentialRotationPending) || snapshot.configuration.listenMode === "lan"} onClick={() => void feedback.runAction(() => ownerCredentialSession.clearOwnerCredential())} type="button" variant="danger">清除凭据</Button>
              <Button disabled={busy} onClick={() => {
                ownerCredentialSession.dismissSecret();
                void feedback.runAction(async () => {
                  await authenticationController.logout();
                  globalThis.location.reload();
                });
              }} type="button">退出登录</Button>
            </div>
          </ToolSection>

          <ToolSection title="迁移数据根">
            <FormLayout>
              <FieldRow fieldId="settings-system-data-root" label="新数据根">
                {(accessibility) => (
                  <InputControl {...accessibility} aria-label="新数据根" onChange={(event) => setMigrationDestination(event.currentTarget.value)} placeholder="绝对路径" value={migrationDestination} />
                )}
              </FieldRow>
              <FormActions>
                <Button disabled={busy || !migrationDestination || ownerCredentialAwaitingConfirmation} onClick={() => {
                  void feedback.runAction(async () => {
                    await configurationController.migrateDataRoot(migrationDestination);
                    reconnectAfterRestart(globalThis.location.origin);
                  });
                }} type="button">开始迁移</Button>
                {configurationState.migration && ["recovery-required", "restarting"].includes(configurationState.migration.status) ? (
                  <Button disabled={busy} onClick={() => void feedback.runAction(async () => {
                    await configurationController.reconcileMigration();
                    if (configurationController.getSnapshot().migration?.status === "restarting") reconnectAfterRestart(globalThis.location.origin);
                  })} type="button">重新对账</Button>
                ) : null}
              </FormActions>
            </FormLayout>
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}

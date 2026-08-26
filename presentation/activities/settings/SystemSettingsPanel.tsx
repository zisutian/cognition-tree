// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState, type FormEvent } from "react";
import type {
  SystemApplication,
  SystemConfigurationInput,
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

function toInput(
  configuration: SystemApplication["configurationState"]["configuration"],
): SystemConfigurationInput | null {
  if (!configuration) return null;
  return {
    listenMode: configuration.configuration.listenMode,
    maxAuditEntries: configuration.configuration.maxAuditEntries,
    port: configuration.configuration.port,
    publicOrigin: configuration.configuration.publicOrigin,
    repositoryHostRoot: configuration.configuration.repositoryHostRoot,
  };
}

function configurationAddress(configuration: SystemConfigurationInput) {
  return configuration.listenMode === "lan"
    ? configuration.publicOrigin
    : `http://127.0.0.1:${configuration.port}`;
}

function reconnectAfterRestart(address: string | null) {
  globalThis.setTimeout(() => {
    if (!address || address === globalThis.location.origin) {
      globalThis.location.reload();
      return;
    }
    globalThis.location.assign(address);
  }, 750);
}

export function SystemSettingsPanel({ system }: { system: SystemApplication }) {
  const feedback = useFeedback();
  const { authenticationController, configurationController, configurationState } = system;
  const snapshot = configurationState.configuration;
  const [draft, setDraft] = useState<SystemConfigurationInput | null>(() =>
    toInput(snapshot)
  );
  const [migrationDestination, setMigrationDestination] = useState("");
  const busy = configurationState.operationStatus === "working";

  useEffect(() => setDraft(toInput(snapshot)), [snapshot]);
  useEffect(() => () => {
    configurationController.dismissRevealedOwnerSecret();
  }, [configurationController]);

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
      await configurationController.update(draft);
      const updated = configurationController.getSnapshot().configuration;

      if (updated?.restartRequired) {
        reconnectAfterRestart(configurationAddress(updated.configuration));
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
          <ToolSection title="网络与路径">
            <form onSubmit={submit}>
              <FormLayout>
                <FieldRow fieldId="settings-system-listen-mode" label="访问范围">
                  {(accessibility) => (
                    <ChoiceGroup
                      {...accessibility}
                      ariaLabel="服务访问范围"
                      mode="single"
                      onChange={(value) => setDraft({
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
                    <InputControl {...accessibility} aria-label="服务端口" max="65535" min="1" onChange={(event) => setDraft({ ...draft, port: event.currentTarget.valueAsNumber })} required type="number" value={draft.port} />
                  )}
                </FieldRow>
                {draft.listenMode === "lan" ? (
                  <FieldRow fieldId="settings-system-public-origin" label="HTTPS 公开地址">
                    {(accessibility) => (
                      <InputControl {...accessibility} aria-label="HTTPS 公开地址" onChange={(event) => setDraft({ ...draft, publicOrigin: event.currentTarget.value || null })} placeholder="https://tree.example.com" required value={draft.publicOrigin ?? ""} />
                    )}
                  </FieldRow>
                ) : null}
                <FieldRow fieldId="settings-system-host-root" label="宿主机显示路径">
                  {(accessibility) => (
                    <InputControl {...accessibility} aria-label="宿主机仓库显示路径" onChange={(event) => setDraft({ ...draft, repositoryHostRoot: event.currentTarget.value || null })} value={draft.repositoryHostRoot ?? ""} />
                  )}
                </FieldRow>
                <FieldRow fieldId="settings-system-audit-limit" label="审计保留条数">
                  {(accessibility) => (
                    <InputControl {...accessibility} aria-label="操作审计保留条数" min="1" onChange={(event) => setDraft({ ...draft, maxAuditEntries: event.currentTarget.valueAsNumber })} required type="number" value={draft.maxAuditEntries} />
                  )}
                </FieldRow>
                <FormActions>
                  <Button disabled={busy} type="submit" variant="primary">保存服务设置</Button>
                </FormActions>
              </FormLayout>
            </form>
          </ToolSection>

          <ToolSection title="所有者凭据">
            <div className="ui-actions">
              <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.rotateOwnerCredential())} type="button">{snapshot.ownerCredentialConfigured ? "轮换密钥" : "创建密钥"}</Button>
              <Button disabled={busy || !snapshot.ownerCredentialConfigured || snapshot.configuration.listenMode === "lan"} onClick={() => void feedback.runAction(() => configurationController.clearOwnerCredential())} type="button" variant="danger">清除凭据</Button>
              <Button onClick={() => void feedback.runAction(async () => {
                await authenticationController.logout();
                globalThis.location.reload();
              })} type="button">退出登录</Button>
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
                <Button disabled={busy || !migrationDestination} onClick={() => void feedback.runAction(async () => {
                  await configurationController.migrateDataRoot(migrationDestination);
                  reconnectAfterRestart(globalThis.location.origin);
                })} type="button">开始迁移</Button>
              </FormActions>
            </FormLayout>
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}

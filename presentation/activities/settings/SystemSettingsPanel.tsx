// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState, type FormEvent } from "react";
import type {
  SystemApplication,
  SystemConfigurationInput,
} from "../../../application/system";
import { Button } from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  FieldRow,
  FormActions,
  FormLayout,
} from "../../ui/shared/FormLayout";
import { StatusBadge } from "../../ui/shared/StatusPresentation";
import {
  ToolPanel,
  ToolPanelBody,
  ToolPropertyList,
  ToolPropertyRow,
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
  const nextAddress = configurationAddress(snapshot.configuration);

  return (
    <ToolPanel
      aria-label="服务设置"
      className="settings-panel"
      title="服务"
    >
      <ToolPanelBody layout="form">
        <ToolSectionStack>
          {configurationState.errorMessage ? <p className="settings-api-error" role="alert">{configurationState.errorMessage}</p> : null}
          <ToolSection title="当前状态">
            <ToolPropertyList aria-label="服务配置状态">
              <ToolPropertyRow
                label="状态"
                value={(
                  <StatusBadge tone={snapshot.restartRequired ? "warning" : "success"}>
                    {snapshot.restartRequired ? "等待重启" : "已生效"}
                  </StatusBadge>
                )}
              />
              <ToolPropertyRow
                label="当前监听"
                value={`${snapshot.effectiveConfiguration.listenMode === "loopback" ? "仅本机" : "局域网"} · ${snapshot.effectiveConfiguration.port}`}
              />
              <ToolPropertyRow
                label="当前数据根"
                value={<code>{snapshot.effectiveConfiguration.dataRoot}</code>}
              />
              <ToolPropertyRow
                label="下一访问地址"
                value={<code>{nextAddress}</code>}
              />
            </ToolPropertyList>
            {snapshot.restartRequired ? (
              <p className="settings-muted" role="status">
                设置已保存，服务将受控重启后生效。
              </p>
            ) : null}
          </ToolSection>

          <ToolSection title="网络与路径">
            <form onSubmit={submit}>
              <FormLayout>
                <FieldRow fieldId="settings-system-listen-mode" label="访问范围">
                  {(accessibility) => (
                    <select
                      {...accessibility}
                      aria-label="服务访问范围"
                      className="ui-input"
                      onChange={(event) => setDraft({
                        ...draft,
                        listenMode: event.currentTarget.value as "lan" | "loopback",
                        publicOrigin: event.currentTarget.value === "loopback"
                          ? null
                          : draft.publicOrigin,
                      })}
                      value={draft.listenMode}
                    >
                      <option value="loopback">仅本机</option>
                      <option value="lan">局域网</option>
                    </select>
                  )}
                </FieldRow>
                <FieldRow fieldId="settings-system-port" label="端口">
                  {(accessibility) => (
                    <input {...accessibility} aria-label="服务端口" className="ui-input" max="65535" min="1" onChange={(event) => setDraft({ ...draft, port: event.currentTarget.valueAsNumber })} required type="number" value={draft.port} />
                  )}
                </FieldRow>
                {draft.listenMode === "lan" ? (
                  <FieldRow fieldId="settings-system-public-origin" label="HTTPS 公开地址">
                    {(accessibility) => (
                      <input {...accessibility} aria-label="HTTPS 公开地址" className="ui-input" onChange={(event) => setDraft({ ...draft, publicOrigin: event.currentTarget.value || null })} placeholder="https://tree.example.com" required value={draft.publicOrigin ?? ""} />
                    )}
                  </FieldRow>
                ) : null}
                <FieldRow fieldId="settings-system-host-root" label="宿主机显示路径">
                  {(accessibility) => (
                    <input {...accessibility} aria-label="宿主机仓库显示路径" className="ui-input" onChange={(event) => setDraft({ ...draft, repositoryHostRoot: event.currentTarget.value || null })} value={draft.repositoryHostRoot ?? ""} />
                  )}
                </FieldRow>
                <FieldRow fieldId="settings-system-audit-limit" label="审计保留条数">
                  {(accessibility) => (
                    <input {...accessibility} aria-label="操作审计保留条数" className="ui-input" min="1" onChange={(event) => setDraft({ ...draft, maxAuditEntries: event.currentTarget.valueAsNumber })} required type="number" value={draft.maxAuditEntries} />
                  )}
                </FieldRow>
                <FormActions>
                  <Button disabled={busy} type="submit" variant="primary">保存服务设置</Button>
                </FormActions>
              </FormLayout>
            </form>
          </ToolSection>

          <ToolSection title="所有者凭据">
            <ToolPropertyList aria-label="所有者凭据状态">
              <ToolPropertyRow
                label="凭据"
                value={(
                  <StatusBadge tone={snapshot.ownerCredentialConfigured ? "success" : "warning"}>
                    {snapshot.ownerCredentialConfigured ? "已创建" : "未创建"}
                  </StatusBadge>
                )}
              />
            </ToolPropertyList>
            <p className="settings-muted">{snapshot.ownerCredentialConfigured ? "远程浏览器可以用密钥登录。" : "局域网模式不能启用。"}</p>
            {configurationState.revealedOwnerSecret ? <div role="status"><p>请立即保存；关闭后无法再次查看：<code>{configurationState.revealedOwnerSecret}</code></p><Button onClick={() => configurationController.dismissRevealedOwnerSecret()} type="button">我已保存，关闭显示</Button></div> : null}
            <div className="ui-actions">
              <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.rotateOwnerCredential())} type="button">{snapshot.ownerCredentialConfigured ? "轮换密钥" : "创建密钥"}</Button>
              <Button disabled={busy || !snapshot.ownerCredentialConfigured || snapshot.configuration.listenMode === "lan"} onClick={() => void feedback.runAction(() => configurationController.clearOwnerCredential())} type="button">清除凭据</Button>
              <Button onClick={() => void feedback.runAction(async () => {
                await authenticationController.logout();
                globalThis.location.reload();
              })} type="button">退出登录</Button>
            </div>
          </ToolSection>

          <ToolSection title="迁移数据根">
            <FormLayout>
              <FieldRow
                description="迁移会同步已加载内容，复制并校验权威数据，再重启服务；旧数据根保留为人工备份。"
                fieldId="settings-system-data-root"
                label="新数据根"
              >
                {(accessibility) => (
                  <input {...accessibility} aria-label="新数据根" className="ui-input" onChange={(event) => setMigrationDestination(event.currentTarget.value)} placeholder="不存在的绝对路径" value={migrationDestination} />
                )}
              </FieldRow>
              <FormActions>
                <Button disabled={busy || !migrationDestination} onClick={() => void feedback.runAction(async () => {
                  await configurationController.migrateDataRoot(migrationDestination);
                  reconnectAfterRestart(globalThis.location.origin);
                })} type="button">开始迁移</Button>
              </FormActions>
            </FormLayout>
            {configurationState.migration ? <p role="status">迁移状态：{configurationState.migration.status}{configurationState.migration.errorMessage ? ` · ${configurationState.migration.errorMessage}` : ""}</p> : null}
          </ToolSection>
        </ToolSectionStack>
      </ToolPanelBody>
    </ToolPanel>
  );
}

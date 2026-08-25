// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useState, type FormEvent } from "react";
import type {
  SystemApplication,
  SystemConfigurationInput,
} from "../../../application/system";
import { Button, Panel, PanelBody, PanelHeader, Section } from "../../ui/shared/primitives";
import { useFeedback } from "../../ui/shared/FeedbackProvider";

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
      <Panel aria-label="服务设置" className="settings-panel">
        <PanelHeader title="服务" />
        <PanelBody><p role="alert">{configurationState.errorMessage ?? "正在读取服务设置……"}</p></PanelBody>
      </Panel>
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
    <Panel aria-label="服务设置" className="settings-panel">
      <PanelHeader title="服务" />
      <PanelBody scroll>
        <div className="settings-content-column settings-service-content">
          {configurationState.errorMessage ? <p className="settings-api-error" role="alert">{configurationState.errorMessage}</p> : null}
          <Section title="当前状态">
            <p>当前数据根：<code>{snapshot.effectiveConfiguration.dataRoot}</code></p>
            <p>当前监听：{snapshot.effectiveConfiguration.listenMode === "loopback" ? "仅本机" : "局域网"} · {snapshot.effectiveConfiguration.port}</p>
            <p>下次访问地址：<code>{nextAddress}</code></p>
            {snapshot.restartRequired ? <p role="status">设置已保存，服务将受控重启后生效。</p> : <p>当前配置已经生效。</p>}
          </Section>

          <Section title="网络与路径">
            <form className="settings-managed-form" onSubmit={submit}>
              <label><span>访问范围</span><select aria-label="服务访问范围" className="ui-input" onChange={(event) => setDraft({ ...draft, listenMode: event.currentTarget.value as "lan" | "loopback", publicOrigin: event.currentTarget.value === "loopback" ? null : draft.publicOrigin })} value={draft.listenMode}><option value="loopback">仅本机</option><option value="lan">局域网</option></select></label>
              <label><span>端口</span><input aria-label="服务端口" className="ui-input" max="65535" min="1" onChange={(event) => setDraft({ ...draft, port: event.currentTarget.valueAsNumber })} required type="number" value={draft.port} /></label>
              {draft.listenMode === "lan" ? <label><span>HTTPS 公开地址</span><input aria-label="HTTPS 公开地址" className="ui-input" onChange={(event) => setDraft({ ...draft, publicOrigin: event.currentTarget.value || null })} placeholder="https://tree.example.com" required value={draft.publicOrigin ?? ""} /></label> : null}
              <label><span>宿主机仓库显示路径（可选）</span><input aria-label="宿主机仓库显示路径" className="ui-input" onChange={(event) => setDraft({ ...draft, repositoryHostRoot: event.currentTarget.value || null })} value={draft.repositoryHostRoot ?? ""} /></label>
              <label><span>智能体审计保留条数</span><input aria-label="智能体审计保留条数" className="ui-input" min="1" onChange={(event) => setDraft({ ...draft, maxAuditEntries: event.currentTarget.valueAsNumber })} required type="number" value={draft.maxAuditEntries} /></label>
              <Button disabled={busy} type="submit" variant="primary">保存服务设置</Button>
            </form>
          </Section>

          <Section title="所有者凭据">
            <p>{snapshot.ownerCredentialConfigured ? "已创建。远程浏览器可以用密钥登录。" : "尚未创建；局域网模式不能启用。"}</p>
            {configurationState.revealedOwnerSecret ? <div role="status"><p>请立即保存；关闭后无法再次查看：<code>{configurationState.revealedOwnerSecret}</code></p><Button onClick={() => configurationController.dismissRevealedOwnerSecret()} type="button">我已保存，关闭显示</Button></div> : null}
            <div className="ui-actions">
              <Button disabled={busy} onClick={() => void feedback.runAction(() => configurationController.rotateOwnerCredential())} type="button">{snapshot.ownerCredentialConfigured ? "轮换密钥" : "创建密钥"}</Button>
              <Button disabled={busy || !snapshot.ownerCredentialConfigured || snapshot.configuration.listenMode === "lan"} onClick={() => void feedback.runAction(() => configurationController.clearOwnerCredential())} type="button">清除凭据</Button>
              <Button onClick={() => void feedback.runAction(async () => {
                await authenticationController.logout();
                globalThis.location.reload();
              })} type="button">退出登录</Button>
            </div>
          </Section>

          <Section title="迁移数据根">
            <p>迁移会先同步已加载内容，复制并校验权威数据，再重启服务。旧数据根保留为人工备份。</p>
            <div className="settings-managed-inline-form">
              <input aria-label="新数据根" className="ui-input" onChange={(event) => setMigrationDestination(event.currentTarget.value)} placeholder="不存在的绝对路径" value={migrationDestination} />
              <Button disabled={busy || !migrationDestination} onClick={() => void feedback.runAction(async () => {
                await configurationController.migrateDataRoot(migrationDestination);
                reconnectAfterRestart(globalThis.location.origin);
              })} type="button">开始迁移</Button>
            </div>
            {configurationState.migration ? <p role="status">迁移状态：{configurationState.migration.status}{configurationState.migration.errorMessage ? ` · ${configurationState.migration.errorMessage}` : ""}</p> : null}
          </Section>
        </div>
      </PanelBody>
    </Panel>
  );
}
